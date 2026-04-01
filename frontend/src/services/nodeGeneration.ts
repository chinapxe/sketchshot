import { message } from 'antd'
import { createGenerateTask } from './api'
import { connectProgress } from './websocket'
import { useFlowStore } from '../stores/useFlowStore'
import { buildGenerationSignature } from '../utils/generationSignature'
import type { ImageGenNodeData, NodeStatus } from '../types'

const activeProgressConnections = new Map<string, () => void>()

export interface ExecuteImageGenNodeOptions {
  showSuccessMessage?: boolean
  showErrorMessage?: boolean
}

export function disconnectNodeGeneration(nodeId: string): void {
  const closeConnection = activeProgressConnections.get(nodeId)
  if (closeConnection) {
    closeConnection()
    activeProgressConnections.delete(nodeId)
  }
}

export async function executeImageGenNode(
  nodeId: string,
  options: ExecuteImageGenNodeOptions = {}
): Promise<void> {
  const { showSuccessMessage = true, showErrorMessage = true } = options
  const store = useFlowStore.getState()
  const node = store.nodes.find((item) => item.id === nodeId)

  if (!node || node.type !== 'imageGen') {
    throw new Error('目标节点不存在，或不是图片生成节点')
  }

  const isDisabled = (node.data as Record<string, unknown>).disabled === true
  if (isDisabled) {
    throw new Error('该节点已禁用，无法执行生成')
  }

  const upstreamImages = store.getUpstreamImages(nodeId)
  store.updateNodeData(nodeId, { upstreamReferenceImages: upstreamImages })

  const latestNode = useFlowStore.getState().nodes.find((item) => item.id === nodeId)
  if (!latestNode || latestNode.type !== 'imageGen') {
    throw new Error('同步节点输入后未找到目标节点')
  }

  const data = latestNode.data as ImageGenNodeData
  const signature = buildGenerationSignature(data)
  const cachedOutputImage = data.resultCache?.[signature]

  if (cachedOutputImage) {
    store.updateNodeData(nodeId, {
      status: 'success' as NodeStatus,
      progress: 100,
      outputImage: cachedOutputImage,
      errorMessage: undefined,
      lastRunSignature: signature,
      needsRefresh: false,
    })

    setTimeout(() => {
      useFlowStore.getState().syncDownstream(nodeId)
    }, 50)

    if (showSuccessMessage) {
      message.success('已复用缓存结果')
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

  disconnectNodeGeneration(nodeId)

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
          const currentNode = useFlowStore.getState().nodes.find((item) => item.id === nodeId)
          const currentData = currentNode?.type === 'imageGen'
            ? (currentNode.data as ImageGenNodeData)
            : data
          const nextResultCache = progressMessage.output_image
            ? {
                ...(currentData.resultCache ?? {}),
                [signature]: progressMessage.output_image,
              }
            : currentData.resultCache

          useFlowStore.getState().updateNodeData(nodeId, {
            status: 'success' as NodeStatus,
            progress: 100,
            outputImage: progressMessage.output_image,
            errorMessage: undefined,
            lastRunSignature: signature,
            resultCache: nextResultCache,
          })

          setTimeout(() => {
            useFlowStore.getState().syncDownstream(nodeId)
          }, 100)

          disconnectNodeGeneration(nodeId)
          if (showSuccessMessage) {
            message.success('图片生成完成')
          }
          resolve()
          return
        }

        settled = true
        useFlowStore.getState().updateNodeData(nodeId, {
          status: 'error' as NodeStatus,
          errorMessage: progressMessage.message,
        })
        disconnectNodeGeneration(nodeId)

        if (showErrorMessage) {
          message.error(`生成失败: ${progressMessage.message}`)
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
        disconnectNodeGeneration(nodeId)
        if (showErrorMessage) {
          message.error(error.message)
        }
        reject(error)
      }
    )

    activeProgressConnections.set(nodeId, closeWs)

    void createGenerateTask({
      node_id: nodeId,
      prompt: data.prompt,
      aspect_ratio: data.aspectRatio,
      resolution: data.resolution,
      reference_images: data.referenceImages || [],
      adapter: data.adapter || 'auto',
      identity_lock: data.identityLock || false,
      identity_strength: data.identityStrength ?? 0.7,
    })
      .then(() => {
        useFlowStore.getState().updateNodeData(nodeId, {
          status: 'processing' as NodeStatus,
        })
      })
      .catch((error) => {
        if (settled) return
        settled = true
        console.error(`[图片生成节点 ${nodeId}] 提交失败:`, error)
        useFlowStore.getState().updateNodeData(nodeId, {
          status: 'error' as NodeStatus,
          errorMessage: '任务提交失败，请检查后端服务',
        })
        disconnectNodeGeneration(nodeId)
        if (showErrorMessage) {
          message.error('任务提交失败，请检查后端服务是否启动')
        }
        reject(new Error('任务提交失败，请检查后端服务'))
      })
  })
}
