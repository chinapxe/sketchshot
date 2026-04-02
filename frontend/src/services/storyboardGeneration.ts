import { message } from 'antd'

import { createGenerateTask, createVideoGenerateTask } from './api'
import { connectProgress } from './websocket'
import { useFlowStore } from '../stores/useFlowStore'
import { buildShotGenerationSignature } from '../utils/generationSignature'
import { buildShotPrompt, getShotContext, getShotVideoSourceImages } from '../utils/storyboard'
import type { NodeStatus, ShotNodeData } from '../types'

const activeProgressConnections = new Map<string, () => void>()

export interface ExecuteShotNodeOptions {
  showSuccessMessage?: boolean
  showErrorMessage?: boolean
}

export function disconnectShotGeneration(nodeId: string): void {
  const closeConnection = activeProgressConnections.get(nodeId)
  if (closeConnection) {
    closeConnection()
    activeProgressConnections.delete(nodeId)
  }
}

export async function executeShotNode(
  nodeId: string,
  options: ExecuteShotNodeOptions = {}
): Promise<void> {
  const { showSuccessMessage = true, showErrorMessage = true } = options
  const store = useFlowStore.getState()
  const node = store.nodes.find((item) => item.id === nodeId)

  if (!node || node.type !== 'shot') {
    throw new Error('目标节点不存在，或不是镜头节点')
  }

  const isDisabled = (node.data as Record<string, unknown>).disabled === true
  if (isDisabled) {
    throw new Error('该镜头节点已禁用，无法执行生成')
  }

  const context = getShotContext(nodeId, store.nodes, store.edges)
  store.updateNodeData(nodeId, {
    referenceImages: context.referenceImages,
    contextSignature: context.contextSignature,
  })

  const latestNode = useFlowStore.getState().nodes.find((item) => item.id === nodeId)
  if (!latestNode || latestNode.type !== 'shot') {
    throw new Error('同步镜头上下文后未找到目标节点')
  }

  const data = latestNode.data as ShotNodeData
  const prompt = buildShotPrompt(data, context)
  const videoSourceImages = data.outputType === 'video' ? getShotVideoSourceImages(data, context) : []

  if (!prompt.trim()) {
    throw new Error('请先填写镜头描述或连接角色、风格、场次信息')
  }

  if (data.outputType === 'video' && videoSourceImages.length === 0) {
    throw new Error('视频镜头至少需要一张参考图或首帧约束图，请先连接角色参考图、上传图或上游图像结果')
  }

  const signature = buildShotGenerationSignature({
    ...data,
    referenceImages: context.referenceImages,
    contextSignature: context.contextSignature,
  })

  const cachedOutput = data.resultCache?.[signature]
  if (cachedOutput) {
    store.updateNodeData(nodeId, {
      status: 'success' as NodeStatus,
      progress: 100,
      outputImage: data.outputType === 'image' ? cachedOutput : undefined,
      outputVideo: data.outputType === 'video' ? cachedOutput : undefined,
      errorMessage: undefined,
      lastRunSignature: signature,
      needsRefresh: false,
    })

    setTimeout(() => {
      useFlowStore.getState().syncDownstream(nodeId)
    }, 50)

    if (showSuccessMessage) {
      message.success('已复用镜头缓存结果')
    }

    return
  }

  store.updateNodeData(nodeId, {
    status: 'queued' as NodeStatus,
    progress: 0,
    errorMessage: undefined,
    lastRunSignature: signature,
    needsRefresh: false,
  })

  disconnectShotGeneration(nodeId)

  await new Promise<void>((resolve, reject) => {
    let settled = false

    const closeWs = connectProgress(
      nodeId,
      (progressMessage) => {
        if (settled) return

        if (progressMessage.status === 'processing') {
          useFlowStore.getState().updateNodeData(nodeId, {
            status: 'processing' as NodeStatus,
            progress: progressMessage.progress,
          })
          return
        }

        if (progressMessage.status === 'success') {
          settled = true

          const outputAsset = data.outputType === 'image'
            ? progressMessage.output_image
            : progressMessage.output_video

          if (!outputAsset) {
            disconnectShotGeneration(nodeId)
            reject(new Error('镜头生成完成，但未返回可用资源'))
            return
          }

          const currentNode = useFlowStore.getState().nodes.find((item) => item.id === nodeId)
          const currentData = currentNode?.type === 'shot'
            ? (currentNode.data as ShotNodeData)
            : data

          useFlowStore.getState().updateNodeData(nodeId, {
            status: 'success' as NodeStatus,
            progress: 100,
            outputImage: data.outputType === 'image' ? outputAsset : undefined,
            outputVideo: data.outputType === 'video' ? outputAsset : undefined,
            errorMessage: undefined,
            lastRunSignature: signature,
            resultCache: {
              ...(currentData.resultCache ?? {}),
              [signature]: outputAsset,
            },
          })

          setTimeout(() => {
            useFlowStore.getState().syncDownstream(nodeId)
          }, 100)

          disconnectShotGeneration(nodeId)
          if (showSuccessMessage) {
            message.success(data.outputType === 'image' ? '镜头图像生成完成' : '镜头视频生成完成')
          }
          resolve()
          return
        }

        settled = true
        useFlowStore.getState().updateNodeData(nodeId, {
          status: 'error' as NodeStatus,
          errorMessage: progressMessage.message,
        })
        disconnectShotGeneration(nodeId)

        if (showErrorMessage) {
          message.error(`镜头生成失败: ${progressMessage.message}`)
        }
        reject(new Error(progressMessage.message))
      },
      (error) => {
        if (settled) return
        settled = true
        useFlowStore.getState().updateNodeData(nodeId, {
          status: 'error' as NodeStatus,
          errorMessage: error.message,
        })
        disconnectShotGeneration(nodeId)

        if (showErrorMessage) {
          message.error(error.message)
        }
        reject(error)
      }
    )

    activeProgressConnections.set(nodeId, closeWs)

    const submitTask = data.outputType === 'image'
      ? createGenerateTask({
          node_id: nodeId,
          prompt,
          aspect_ratio: data.aspectRatio,
          resolution: data.resolution,
          reference_images: context.referenceImages,
          adapter: data.imageAdapter || 'auto',
          identity_lock: data.identityLock || false,
          identity_strength: data.identityStrength ?? 0.7,
        })
      : createVideoGenerateTask({
          node_id: nodeId,
          prompt,
          aspect_ratio: data.aspectRatio,
          duration_seconds: data.durationSeconds,
          motion_strength: data.motionStrength,
          source_images: videoSourceImages,
          adapter: data.videoAdapter || 'volcengine',
        })

    void submitTask
      .then(() => {
        useFlowStore.getState().updateNodeData(nodeId, {
          status: 'processing' as NodeStatus,
        })
      })
      .catch((error) => {
        if (settled) return
        settled = true
        useFlowStore.getState().updateNodeData(nodeId, {
          status: 'error' as NodeStatus,
          errorMessage: '任务提交失败，请检查后端服务',
        })
        disconnectShotGeneration(nodeId)

        if (showErrorMessage) {
          message.error('任务提交失败，请检查后端服务是否启动')
        }
        reject(error instanceof Error ? error : new Error('任务提交失败，请检查后端服务'))
      })
  })
}
