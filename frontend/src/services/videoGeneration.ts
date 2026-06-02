import { message } from 'antd'

import { createVideoGenerateTask } from './api'
import { resolveVideoAdapter } from './engineSettings'
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
    throw new Error('目标节点不存在，或不是视频生成节点')
  }

  const isDisabled = (node.data as Record<string, unknown>).disabled === true
  if (isDisabled) {
    throw new Error('该节点已禁用，无法生成视频')
  }

  const sourceImages = store.getUpstreamImages(nodeId)
  const nodeData = node.data as VideoGenNodeData
  const isSeedanceV2 = (nodeData.adapter === 'volcengine' || !nodeData.adapter) && nodeData.seedanceVersion === '2.0'
  const finalSourceImages = isSeedanceV2
    ? store.getUpstreamImageOriginalUrls(nodeId)
    : sourceImages
  store.updateNodeData(nodeId, { sourceImages: finalSourceImages })

  const latestNode = useFlowStore.getState().nodes.find((item) => item.id === nodeId)
  if (!latestNode || latestNode.type !== 'videoGen') {
    throw new Error('同步视频输入后未找到目标节点')
  }

  const data = latestNode.data as VideoGenNodeData
  const resolvedAdapter = await resolveVideoAdapter(data.adapter)
  const isHappyHorse = resolvedAdapter === 'happyhorse'
  const happyhorseMode = isHappyHorse ? (data.happyhorseMode || 't2v') : null

  // HappyHorse t2v mode doesn't need source images
  if (!isHappyHorse || happyhorseMode !== 't2v') {
    if ((data.sourceImages ?? []).length === 0) {
      throw new Error('请先连接至少一个图像输入节点，再生成视频')
    }
  }

  const rawPrompt = data.prompt.trim()
  const prompt = data.nonRealisticStyle === true
    ? `3D动画风格，非真人角色，卡通渲染，CG画面，${rawPrompt}`
    : rawPrompt
  if (!rawPrompt) {
    const validationMessage =
      '请先填写视频提示词，或点击“AI 润色”生成一版运动描述；九宫格图只会作为起始画面，不会自动继承视频提示词。'

    store.updateNodeData(nodeId, {
      status: 'error' as NodeStatus,
      progress: 0,
      errorMessage: validationMessage,
    })

    if (showErrorMessage) {
      message.warning(validationMessage)
    }

    throw new Error(validationMessage)
  }

  const signature = buildVideoGenerationSignature({ ...data, adapter: resolvedAdapter })
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
      message.success('已复用缓存视频结果')
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
            reject(new Error('视频生成完成，但未返回可用资源'))
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

          const outputLastFrame = progressMessage.output_last_frame ?? undefined

          useFlowStore.getState().updateNodeData(nodeId, {
            status: 'success' as NodeStatus,
            progress: 100,
            outputVideo,
            outputLastFrame,
            errorMessage: undefined,
            lastRunSignature: signature,
            resultCache: nextResultCache,
          })

          setTimeout(() => {
            useFlowStore.getState().syncDownstream(nodeId)
          }, 100)

          disconnectVideoGeneration(nodeId)
          if (showSuccessMessage) {
            message.success('视频生成完成')
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
          message.error(`视频生成失败: ${progressMessage.message}`)
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

    const videoTaskType = isHappyHorse ? (happyhorseMode ?? 't2v') : 'video'
    const videoSourceImages = isHappyHorse && happyhorseMode === 't2v' ? [] : (data.sourceImages ?? [])
    const videoReferenceImages = isHappyHorse && happyhorseMode === 'r2v' ? (data.sourceImages ?? []) : []

    void createVideoGenerateTask({
      node_id: nodeId,
      prompt,
      aspect_ratio: data.aspectRatio,
      duration_seconds: data.durationSeconds,
      motion_strength: data.motionStrength,
      source_images: videoSourceImages,
      reference_images: videoReferenceImages,
      adapter: resolvedAdapter,
      task_type: videoTaskType,
      seedance_version: data.seedanceVersion,
      generate_audio: data.generateAudio,
      with_audio: data.happyhorseWithAudio,
      happyhorse_mode: data.happyhorseQualityMode,
      video_resolution: data.videoResolution,
      negative_prompt: data.negativePrompt,
      seed: data.seed,
      camera_fixed: data.cameraFixed,
      video_model_tier: data.videoModelTier,
      return_last_frame: data.returnLastFrame,
      reference_videos: data.referenceVideos ?? [],
      reference_audios: data.referenceAudios ?? [],
      multi_image_role: data.multiImageRole ?? 'transition',
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
          errorMessage: '任务提交失败，请检查后端服务',
        })
        disconnectVideoGeneration(nodeId)

        if (showErrorMessage) {
          message.error('任务提交失败，请检查后端服务是否启动')
        }
        reject(error instanceof Error ? error : new Error('任务提交失败，请检查后端服务'))
      })
  })
}
