import { message } from 'antd'

import { createVideoEditTask, getTaskStatus } from './api'
import { useFlowStore } from '../stores/useFlowStore'
import type { NodeStatus, VideoEditNodeData } from '../types'

const activePolling = new Map<string, () => void>()

export function disconnectVideoEditGeneration(nodeId: string): void {
  const cancel = activePolling.get(nodeId)
  if (cancel) {
    cancel()
    activePolling.delete(nodeId)
  }
}

export async function executeVideoEditNode(
  nodeId: string,
  options: { showSuccessMessage?: boolean; showErrorMessage?: boolean } = {}
): Promise<void> {
  const { showSuccessMessage = true, showErrorMessage = true } = options
  const store = useFlowStore.getState()
  const node = store.nodes.find((item) => item.id === nodeId)

  if (!node || node.type !== 'videoEdit') {
    throw new Error('目标节点不存在，或不是视频编辑节点')
  }

  const isDisabled = (node.data as Record<string, unknown>).disabled === true
  if (isDisabled) {
    throw new Error('该节点已禁用，无法编辑视频')
  }

  const data = node.data as VideoEditNodeData
  const prompt = data.prompt.trim()
  if (!prompt) {
    store.updateNodeData(nodeId, {
      status: 'error' as NodeStatus,
      errorMessage: '请先填写编辑提示词',
    })
    throw new Error('请先填写编辑提示词')
  }

  if (!data.sourceVideo) {
    store.updateNodeData(nodeId, {
      status: 'error' as NodeStatus,
      errorMessage: '请先连接上游视频输入',
    })
    throw new Error('请先连接上游视频输入')
  }

  store.updateNodeData(nodeId, {
    status: 'queued' as NodeStatus,
    progress: 0,
    errorMessage: undefined,
  })

  disconnectVideoEditGeneration(nodeId)

  await new Promise<void>((resolve, reject) => {
    let settled = false

    void createVideoEditTask({
      node_id: nodeId,
      prompt,
      source_video: data.sourceVideo,
      reference_images: [...(data.upstreamReferenceImages ?? []), ...(data.referenceImages ?? [])],
      adapter: data.adapter,
      resolution: data.resolution,
      vedit_model: data.veditModel,
      seedance_version: data.seedanceVersion ?? '1.5',
      generate_audio: data.generateAudio,
      video_resolution: data.videoResolution,
      negative_prompt: data.negativePrompt,
      seed: data.seed,
      camera_fixed: data.cameraFixed,
      return_last_frame: data.returnLastFrame,
      duration_seconds: data.durationSeconds,
    })
      .then((result) => {
        if (settled) return

        store.updateNodeData(nodeId, {
          status: 'processing' as NodeStatus,
          progress: 10,
        })

        let cancelled = false
        activePolling.set(nodeId, () => { cancelled = true })

        const poll = async () => {
          if (cancelled || settled) return

          try {
            const status = await getTaskStatus(result.task_id)

            if (status.status === 'processing' || status.status === 'pending') {
              store.updateNodeData(nodeId, { progress: status.progress ?? 50 })
              setTimeout(poll, 2000)
              return
            }

            if (status.status === 'success' && status.output_video) {
              settled = true
              activePolling.delete(nodeId)

              const currentNode = useFlowStore.getState().nodes.find((n) => n.id === nodeId)
              const currentData = currentNode?.type === 'videoEdit'
                ? (currentNode.data as VideoEditNodeData)
                : data
              const nextResultCache = {
                ...(currentData.resultCache ?? {}),
                [result.task_id]: status.output_video,
              }

              store.updateNodeData(nodeId, {
                status: 'success' as NodeStatus,
                progress: 100,
                outputVideo: status.output_video,
                errorMessage: undefined,
                resultCache: nextResultCache,
              })

              setTimeout(() => {
                useFlowStore.getState().syncDownstream(nodeId)
              }, 100)

              if (showSuccessMessage) {
                message.success('视频编辑完成')
              }
              resolve()
              return
            }

            settled = true
            activePolling.delete(nodeId)
            store.updateNodeData(nodeId, {
              status: 'error' as NodeStatus,
              errorMessage: status.error_message ?? '视频编辑失败',
            })

            if (showErrorMessage) {
              message.error(status.error_message ?? '视频编辑失败')
            }
            reject(new Error(status.error_message ?? '视频编辑失败'))
          } catch (error) {
            if (cancelled) return
            setTimeout(poll, 2000)
          }
        }

        setTimeout(poll, 2000)
      })
      .catch((error) => {
        if (settled) return
        settled = true
        store.updateNodeData(nodeId, {
          status: 'error' as NodeStatus,
          errorMessage: '任务提交失败，请检查后端服务',
        })

        if (showErrorMessage) {
          message.error('任务提交失败，请检查后端服务是否启动')
        }
        reject(error instanceof Error ? error : new Error('任务提交失败，请检查后端服务'))
      })
  })
}
