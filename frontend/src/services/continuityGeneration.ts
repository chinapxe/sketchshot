import { message } from 'antd'

import { createGenerateTask } from './api'
import { buildContinuityPreviewPrompt } from './promptGeneration'
import { connectProgress } from './websocket'
import { useFlowStore } from '../stores/useFlowStore'
import {
  MAX_CHARACTER_IDENTITY_STRENGTH,
  appendCharacterConsistencyPrompt,
  hasCharacterReferenceImages,
} from '../utils/characterConsistency'
import { buildContinuityGenerationSignature } from '../utils/generationSignature'
import { getContinuityContext } from '../utils/storyboard'
import type { ContinuityNodeData, NodeStatus } from '../types'

const activeProgressConnections = new Map<string, () => void>()

export interface ExecuteContinuityNodeOptions {
  showSuccessMessage?: boolean
  showErrorMessage?: boolean
}

export function disconnectContinuityGeneration(nodeId: string): void {
  const closeConnection = activeProgressConnections.get(nodeId)
  if (closeConnection) {
    closeConnection()
    activeProgressConnections.delete(nodeId)
  }
}

function hasContinuityInput(data: ContinuityNodeData): boolean {
  if (data.prompt.trim().length > 0) {
    return true
  }

  return (data.frames ?? []).some((frame) => frame.trim().length > 0)
}

export async function executeContinuityNode(
  nodeId: string,
  options: ExecuteContinuityNodeOptions = {}
): Promise<void> {
  const { showSuccessMessage = true, showErrorMessage = true } = options
  const store = useFlowStore.getState()
  const node = store.nodes.find((item) => item.id === nodeId)

  if (!node || node.type !== 'continuity') {
    throw new Error('目标节点不存在，或不是九宫格动作节点')
  }

  const isDisabled = (node.data as Record<string, unknown>).disabled === true
  if (isDisabled) {
    throw new Error('该节点已禁用，无法生成九宫格预览图')
  }

  const continuityContext = getContinuityContext(nodeId, store.nodes, store.edges)
  store.updateNodeData(nodeId, { contextSignature: continuityContext.contextSignature })

  const latestNode = useFlowStore.getState().nodes.find((item) => item.id === nodeId)
  if (!latestNode || latestNode.type !== 'continuity') {
    throw new Error('同步九宫格上下文后未找到目标节点')
  }

  const data = latestNode.data as ContinuityNodeData
  if (!hasContinuityInput(data) && continuityContext.referenceImages.length === 0) {
    throw new Error('请先填写总提示词或拆出九格动作，再生成九宫格预览图')
  }

  const finalPrompt = appendCharacterConsistencyPrompt(
    buildContinuityPreviewPrompt(data, continuityContext),
    continuityContext.referenceImages
  )
  const signature = buildContinuityGenerationSignature({
    ...data,
    contextSignature: continuityContext.contextSignature,
  })
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
      message.success('已复用九宫格预览缓存')
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

  disconnectContinuityGeneration(nodeId)

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
          const currentData = currentNode?.type === 'continuity'
            ? (currentNode.data as ContinuityNodeData)
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

          disconnectContinuityGeneration(nodeId)
          if (showSuccessMessage) {
            message.success('九宫格预览图生成完成')
          }
          resolve()
          return
        }

        settled = true
        useFlowStore.getState().updateNodeData(nodeId, {
          status: 'error' as NodeStatus,
          errorMessage: progressMessage.message,
        })
        disconnectContinuityGeneration(nodeId)

        if (showErrorMessage) {
          message.error(`九宫格预览图生成失败: ${progressMessage.message}`)
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
        disconnectContinuityGeneration(nodeId)
        if (showErrorMessage) {
          message.error(error.message)
        }
        reject(error)
      }
    )

    activeProgressConnections.set(nodeId, closeWs)

    void createGenerateTask({
      node_id: nodeId,
      prompt: finalPrompt,
      aspect_ratio: data.aspectRatio ?? '1:1',
      resolution: data.resolution ?? '2K',
      reference_images: continuityContext.referenceImages,
      adapter: data.adapter ?? 'volcengine',
      identity_lock: hasCharacterReferenceImages(continuityContext.referenceImages),
      identity_strength: MAX_CHARACTER_IDENTITY_STRENGTH,
    })
      .then(() => {
        useFlowStore.getState().updateNodeData(nodeId, {
          status: 'processing' as NodeStatus,
        })
      })
      .catch((error) => {
        if (settled) return
        settled = true
        console.error(`[九宫格动作节点 ${nodeId}] 提交预览图任务失败:`, error)
        useFlowStore.getState().updateNodeData(nodeId, {
          status: 'error' as NodeStatus,
          errorMessage: '任务提交失败，请检查后端服务',
        })
        disconnectContinuityGeneration(nodeId)
        if (showErrorMessage) {
          message.error('任务提交失败，请检查后端服务是否启动')
        }
        reject(new Error('任务提交失败，请检查后端服务'))
      })
  })
}
