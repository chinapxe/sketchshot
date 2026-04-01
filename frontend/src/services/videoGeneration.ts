import { message } from 'antd'

import { createVideoGenerateTask } from './api'
import { connectProgress } from './websocket'
import { useFlowStore } from '../stores/useFlowStore'
import { buildVideoGenerationSignature } from '../utils/generationSignature'
import type { NodeStatus, VideoGenNodeData } from '../types'

const activeProgressConnections = new Map<string, () => void>()

export interface ExecuteVideoGenNodeOptions {
  showSuccessMessage?: boolean
  showErrorMessage?: boolean
}

export function disconnectVideoGeneration(nodeId: string): void {
  const closeConnection = activeProgressConnections.get(nodeId)
  if (closeConnection) {
    closeConnection()
    activeProgressConnections.delete(nodeId)
  }
}

export async function executeVideoGenNode(
  nodeId: string,
  options: ExecuteVideoGenNodeOptions = {}
): Promise<void> {
  const { showSuccessMessage = true, showErrorMessage = true } = options
  const store = useFlowStore.getState()
  const node = store.nodes.find((item) => item.id === nodeId)

  if (!node || node.type !== 'videoGen') {
    throw new Error('Target node is missing or is not a video generation node')
  }

  const isDisabled = (node.data as Record<string, unknown>).disabled === true
  if (isDisabled) {
    throw new Error('This node is disabled and cannot generate a motion clip')
  }

  const sourceImages = store.getUpstreamImages(nodeId)
  store.updateNodeData(nodeId, { sourceImages })

  const latestNode = useFlowStore.getState().nodes.find((item) => item.id === nodeId)
  if (!latestNode || latestNode.type !== 'videoGen') {
    throw new Error('Unable to refresh video generation inputs before execution')
  }

  const data = latestNode.data as VideoGenNodeData
  if ((data.sourceImages ?? []).length === 0) {
    throw new Error('Connect at least one image node before generating a motion clip')
  }

  const signature = buildVideoGenerationSignature(data)
  const cachedOutputVideo = data.resultCache?.[signature]

  if (cachedOutputVideo) {
    store.updateNodeData(nodeId, {
      status: 'success' as NodeStatus,
      progress: 100,
      outputVideo: cachedOutputVideo,
      errorMessage: undefined,
      lastRunSignature: signature,
      needsRefresh: false,
    })

    setTimeout(() => {
      useFlowStore.getState().syncDownstream(nodeId)
    }, 50)

    if (showSuccessMessage) {
      message.success('Reused cached motion clip')
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

  disconnectVideoGeneration(nodeId)

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
          const outputVideo = progressMessage.output_video
          if (!outputVideo) {
            settled = true
            disconnectVideoGeneration(nodeId)
            reject(new Error('Video generation completed without a motion asset URL'))
            return
          }

          settled = true
          const currentNode = useFlowStore.getState().nodes.find((item) => item.id === nodeId)
          const currentData = currentNode?.type === 'videoGen'
            ? (currentNode.data as VideoGenNodeData)
            : data
          const nextResultCache = {
            ...(currentData.resultCache ?? {}),
            [signature]: outputVideo,
          }

          useFlowStore.getState().updateNodeData(nodeId, {
            status: 'success' as NodeStatus,
            progress: 100,
            outputVideo,
            errorMessage: undefined,
            lastRunSignature: signature,
            resultCache: nextResultCache,
          })

          setTimeout(() => {
            useFlowStore.getState().syncDownstream(nodeId)
          }, 100)

          disconnectVideoGeneration(nodeId)
          if (showSuccessMessage) {
            message.success('Motion clip generated')
          }
          resolve()
          return
        }

        settled = true
        useFlowStore.getState().updateNodeData(nodeId, {
          status: 'error' as NodeStatus,
          errorMessage: progressMessage.message,
        })
        disconnectVideoGeneration(nodeId)

        if (showErrorMessage) {
          message.error(`Video generation failed: ${progressMessage.message}`)
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
        disconnectVideoGeneration(nodeId)

        if (showErrorMessage) {
          message.error(error.message)
        }
        reject(error)
      }
    )

    activeProgressConnections.set(nodeId, closeWs)

    void createVideoGenerateTask({
      node_id: nodeId,
      prompt: data.prompt,
      aspect_ratio: data.aspectRatio,
      duration_seconds: data.durationSeconds,
      motion_strength: data.motionStrength,
      source_images: data.sourceImages ?? [],
      adapter: data.adapter,
    })
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
          errorMessage: 'Task submission failed, please verify the backend service',
        })
        disconnectVideoGeneration(nodeId)

        if (showErrorMessage) {
          message.error('Task submission failed, please verify the backend service')
        }
        reject(error instanceof Error ? error : new Error('Task submission failed'))
      })
  })
}
