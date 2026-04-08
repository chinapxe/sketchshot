import { message } from 'antd'

import { createGenerateTask, splitThreeViewSheet } from './api'
import { connectProgress } from './websocket'
import { useFlowStore } from '../stores/useFlowStore'
import type { CharacterThreeViewImages, NodeStatus, ThreeViewGenNodeData } from '../types'
import {
  MAX_CHARACTER_IDENTITY_STRENGTH,
  appendCharacterConsistencyPrompt,
  hasCharacterReferenceImages,
} from '../utils/characterConsistency'
import { buildThreeViewGenerationSignature } from '../utils/generationSignature'
import {
  THREE_VIEW_SLOT_KEYS,
  type ThreeViewSlotKey,
  getThreeViewOutputMode,
  hasCompleteThreeViewImages,
  normalizeLooseThreeViewImages,
} from '../utils/threeView'

const activeProgressConnections = new Map<string, () => void>()

const splitPromptLabels: Record<ThreeViewSlotKey, { zh: string; en: string }> = {
  front: { zh: '正面', en: 'front' },
  side: { zh: '侧面', en: 'side' },
  back: { zh: '背面', en: 'back' },
}

export interface ExecuteThreeViewGenNodeOptions {
  showSuccessMessage?: boolean
  showErrorMessage?: boolean
}

function closeProgressConnection(connectionKey: string): void {
  const closeConnection = activeProgressConnections.get(connectionKey)
  if (closeConnection) {
    closeConnection()
    activeProgressConnections.delete(connectionKey)
  }
}

export function disconnectThreeViewGeneration(nodeId: string): void {
  Array.from(activeProgressConnections.keys())
    .filter((connectionKey) => connectionKey === nodeId || connectionKey.startsWith(`${nodeId}__`))
    .forEach((connectionKey) => closeProgressConnection(connectionKey))
}

function inferPromptLanguage(value: string): 'zh' | 'en' {
  if (value.trim().length === 0) {
    return 'zh'
  }

  return /[\u4e00-\u9fff]/.test(value) ? 'zh' : 'en'
}

function buildThreeViewSheetPrompt(data: ThreeViewGenNodeData): string {
  const prompt = data.prompt.trim()

  if (inferPromptLanguage(prompt) === 'en') {
    const sections = [
      'Generate a single character turnaround sheet based on the reference image.',
      'The output must be one clean sheet containing full-body front view, side view, and back view of the same character.',
      'Keep the exact same identity, face, hairstyle, costume, colors, body proportions, and silhouette across all three views.',
      'Use a neutral standing pose, complete body framing, clean background, and clear layout for design reference.',
      'Do not add extra characters, text labels, watermarks, speech bubbles, or decorative frames.',
    ]

    if (prompt.length > 0) {
      sections.push(`Additional requirements: ${prompt}`)
    }

    return sections.join('\n')
  }

  const sections = [
    '根据参考图生成一张完整的人物三视图设定板。',
    '输出必须是一张拼板图，包含同一角色的正面、侧面、背面三视图，并保持全身完整可见。',
    '三视图中的人物脸部特征、发型、服装、配色、体型比例和轮廓必须保持一致。',
    '角色保持中立站姿，背景简洁干净，排版清晰，适合作为角色设定 turnaround sheet 参考。',
    '不要额外人物，不要文字标注，不要水印，不要对话框，不要多余装饰边框。',
  ]

  if (prompt.length > 0) {
    sections.push(`补充要求：${prompt}`)
  }

  return sections.join('\n')
}

function buildThreeViewSplitPrompt(data: ThreeViewGenNodeData, slot: ThreeViewSlotKey): string {
  const prompt = data.prompt.trim()
  const language = inferPromptLanguage(prompt)
  const labels = splitPromptLabels[slot]

  if (language === 'en') {
    const sections = [
      `Generate one clean full-body ${labels.en} view of the same character based on the reference image.`,
      `Output only a single ${labels.en} view image, not a turnaround sheet, collage, or multiple poses.`,
      'Keep the exact same identity, face, hairstyle, costume, colors, body proportions, and silhouette as the reference character.',
      'Use a neutral standing pose, complete body framing, and a clean background suitable for design reference.',
      'Do not add extra characters, text labels, watermarks, speech bubbles, or decorative frames.',
    ]

    if (prompt.length > 0) {
      sections.push(`Additional requirements: ${prompt}`)
    }

    return sections.join('\n')
  }

  const sections = [
    `根据参考图生成同一角色的单张${labels.zh}全身图。`,
    `只输出一张${labels.zh}图，不要拼板，不要多视角合集，不要多姿势。`,
    '角色的脸部特征、发型、服装、配色、体型比例和轮廓必须与参考角色保持一致。',
    '角色保持中立站姿，全身完整可见，背景简洁干净，适合作为设计参考。',
    '不要额外人物，不要文字标注，不要水印，不要对话框，不要多余装饰边框。',
  ]

  if (prompt.length > 0) {
    sections.push(`补充要求：${prompt}`)
  }

  return sections.join('\n')
}

function mapTaskProgress(progress: number, start: number, end: number): number {
  const safeProgress = Math.max(0, Math.min(100, progress))
  return Math.round(start + ((end - start) * safeProgress) / 100)
}

interface RunSingleThreeViewTaskOptions {
  storeNodeId: string
  taskNodeId: string
  data: ThreeViewGenNodeData
  prompt: string
  progressStart: number
  progressEnd: number
  showErrorMessage: boolean
  onTaskSuccess?: (outputImage: string) => void
}

function runSingleThreeViewTask({
  storeNodeId,
  taskNodeId,
  data,
  prompt,
  progressStart,
  progressEnd,
  showErrorMessage,
  onTaskSuccess,
}: RunSingleThreeViewTaskOptions): Promise<string> {
  closeProgressConnection(taskNodeId)

  return new Promise<string>((resolve, reject) => {
    let settled = false

    const closeWs = connectProgress(
      taskNodeId,
      (progressMessage) => {
        if (settled) return

        if (progressMessage.status === 'processing') {
          useFlowStore.getState().updateNodeData(storeNodeId, {
            status: 'processing' as NodeStatus,
            progress: mapTaskProgress(progressMessage.progress, progressStart, progressEnd),
          })
          return
        }

        if (progressMessage.status === 'success') {
          if (!progressMessage.output_image) {
            settled = true
            closeProgressConnection(taskNodeId)
            const missingOutputError = new Error('三视图生成成功但未返回图片结果')
            useFlowStore.getState().updateNodeData(storeNodeId, {
              status: 'error' as NodeStatus,
              errorMessage: missingOutputError.message,
            })
            if (showErrorMessage) {
              message.error(missingOutputError.message)
            }
            reject(missingOutputError)
            return
          }

          settled = true
          onTaskSuccess?.(progressMessage.output_image)
          useFlowStore.getState().updateNodeData(storeNodeId, {
            status: 'processing' as NodeStatus,
            progress: progressEnd,
            errorMessage: undefined,
          })
          closeProgressConnection(taskNodeId)
          resolve(progressMessage.output_image)
          return
        }

        settled = true
        useFlowStore.getState().updateNodeData(storeNodeId, {
          status: 'error' as NodeStatus,
          errorMessage: progressMessage.message,
        })
        closeProgressConnection(taskNodeId)

        if (showErrorMessage) {
          message.error(`三视图生成失败: ${progressMessage.message}`)
        }
        reject(new Error(progressMessage.message))
      },
      (error) => {
        if (settled) return
        settled = true
        useFlowStore.getState().updateNodeData(storeNodeId, {
          status: 'error' as NodeStatus,
          errorMessage: error.message,
        })
        closeProgressConnection(taskNodeId)
        if (showErrorMessage) {
          message.error(error.message)
        }
        reject(error)
      }
    )

    activeProgressConnections.set(taskNodeId, closeWs)

    void createGenerateTask({
      node_id: taskNodeId,
      prompt: appendCharacterConsistencyPrompt(prompt, data.referenceImages),
      aspect_ratio: data.aspectRatio,
      resolution: data.resolution,
      reference_images: data.referenceImages,
      adapter: data.adapter || 'volcengine',
      identity_lock: hasCharacterReferenceImages(data.referenceImages),
      identity_strength: MAX_CHARACTER_IDENTITY_STRENGTH,
    })
      .then(() => {
        const currentNode = useFlowStore.getState().nodes.find((item) => item.id === storeNodeId)
        const currentProgress = currentNode?.type === 'threeViewGen' ? currentNode.data.progress : 0

        useFlowStore.getState().updateNodeData(storeNodeId, {
          status: 'processing' as NodeStatus,
          progress: Math.max(currentProgress, progressStart),
        })
      })
      .catch((error) => {
        if (settled) return
        settled = true
        console.error(`[three-view:${storeNodeId}] task submit failed for ${taskNodeId}:`, error)
        useFlowStore.getState().updateNodeData(storeNodeId, {
          status: 'error' as NodeStatus,
          errorMessage: '任务提交失败，请检查后端服务',
        })
        closeProgressConnection(taskNodeId)
        if (showErrorMessage) {
          message.error('任务提交失败，请检查后端服务是否正常')
        }
        reject(new Error('任务提交失败，请检查后端服务'))
      })
  })
}

function syncDownstreamAfterGeneration(nodeId: string): void {
  setTimeout(() => {
    useFlowStore.getState().syncDownstream(nodeId)
  }, 100)
}

async function trySplitThreeViewSheet(outputImage: string): Promise<CharacterThreeViewImages | null> {
  try {
    const result = await splitThreeViewSheet({ asset_url: outputImage })
    return {
      front: result.front,
      side: result.side,
      back: result.back,
    }
  } catch (error) {
    console.info('[three-view] sheet split skipped:', error)
    return null
  }
}

export async function executeThreeViewGenNode(
  nodeId: string,
  options: ExecuteThreeViewGenNodeOptions = {}
): Promise<void> {
  const { showSuccessMessage = true, showErrorMessage = true } = options
  const store = useFlowStore.getState()
  const node = store.nodes.find((item) => item.id === nodeId)

  if (!node || node.type !== 'threeViewGen') {
    throw new Error('目标节点不存在，或不是三视图生成节点')
  }

  const isDisabled = (node.data as Record<string, unknown>).disabled === true
  if (isDisabled) {
    throw new Error('该节点已禁用，无法执行三视图生成')
  }

  const referenceImages = store.getUpstreamImages(nodeId)
  store.updateNodeData(nodeId, { referenceImages })

  const latestNode = useFlowStore.getState().nodes.find((item) => item.id === nodeId)
  if (!latestNode || latestNode.type !== 'threeViewGen') {
    throw new Error('同步参考图后未找到目标三视图节点')
  }

  const data = latestNode.data as ThreeViewGenNodeData
  if (data.referenceImages.length === 0) {
    throw new Error('请先接入至少一张参考图，再生成三视图')
  }

  const signature = buildThreeViewGenerationSignature(data)
  const outputMode = getThreeViewOutputMode(data)
  const cachedOutputImage = outputMode === 'sheet' ? data.resultCache?.[signature] : undefined
  const cachedSplitOutputImages =
    outputMode === 'split' ? normalizeLooseThreeViewImages(data.splitResultCache?.[signature]) : {}

  if (cachedOutputImage) {
    store.updateNodeData(nodeId, {
      status: 'success' as NodeStatus,
      progress: 100,
      outputImage: cachedOutputImage,
      outputImages: {},
      errorMessage: undefined,
      lastRunSignature: signature,
      needsRefresh: false,
    })
    syncDownstreamAfterGeneration(nodeId)

    if (showSuccessMessage) {
      message.success('已复用三视图缓存结果')
    }
    return
  }

  if (outputMode === 'split' && hasCompleteThreeViewImages(cachedSplitOutputImages)) {
    store.updateNodeData(nodeId, {
      status: 'success' as NodeStatus,
      progress: 100,
      outputImage: undefined,
      outputImages: cachedSplitOutputImages,
      errorMessage: undefined,
      lastRunSignature: signature,
      needsRefresh: false,
    })
    syncDownstreamAfterGeneration(nodeId)

    if (showSuccessMessage) {
      message.success('已复用三视图缓存结果')
    }
    return
  }

  store.updateNodeData(nodeId, {
    status: 'queued' as NodeStatus,
    progress: 0,
    errorMessage: undefined,
    lastRunSignature: signature,
    needsRefresh: false,
    outputImage: undefined,
    outputImages: {},
  })

  disconnectThreeViewGeneration(nodeId)

  if (outputMode === 'sheet') {
    const outputImage = await runSingleThreeViewTask({
      storeNodeId: nodeId,
      taskNodeId: nodeId,
      data,
      prompt: buildThreeViewSheetPrompt(data),
      progressStart: 0,
      progressEnd: 100,
      showErrorMessage,
    })

    const currentNode = useFlowStore.getState().nodes.find((item) => item.id === nodeId)
    const currentData = currentNode?.type === 'threeViewGen'
      ? (currentNode.data as ThreeViewGenNodeData)
      : data
    const nextResultCache = {
      ...(currentData.resultCache ?? {}),
      [signature]: outputImage,
    }

    useFlowStore.getState().updateNodeData(nodeId, {
      status: 'success' as NodeStatus,
      progress: 100,
      outputImage,
      outputImages: {},
      errorMessage: undefined,
      lastRunSignature: signature,
      resultCache: nextResultCache,
    })
    syncDownstreamAfterGeneration(nodeId)

    if (showSuccessMessage) {
      message.success('三视图生成完成')
    }
    return
  }

  let outputImages: CharacterThreeViewImages = {}

  for (let index = 0; index < THREE_VIEW_SLOT_KEYS.length; index += 1) {
    const slot = THREE_VIEW_SLOT_KEYS[index]
    const rawImage = await runSingleThreeViewTask({
      storeNodeId: nodeId,
      taskNodeId: `${nodeId}__${slot}`,
      data,
      prompt: buildThreeViewSplitPrompt(data, slot),
      progressStart: Math.round((index * 100) / THREE_VIEW_SLOT_KEYS.length),
      progressEnd: Math.round(((index + 1) * 100) / THREE_VIEW_SLOT_KEYS.length),
      showErrorMessage,
    })

    const extractedImages = await trySplitThreeViewSheet(rawImage)
    if (extractedImages) {
      const remainingSlots = THREE_VIEW_SLOT_KEYS.slice(index)
      outputImages = {
        ...outputImages,
        ...Object.fromEntries(
          remainingSlots
            .filter((remainingSlot) => typeof extractedImages[remainingSlot] === 'string' && extractedImages[remainingSlot]!.length > 0)
            .map((remainingSlot) => [remainingSlot, extractedImages[remainingSlot]!])
        ),
      }

      useFlowStore.getState().updateNodeData(nodeId, {
        outputImages,
      })

      if (hasCompleteThreeViewImages(outputImages)) {
        break
      }

      continue
    }

    outputImages = {
      ...outputImages,
      [slot]: rawImage,
    }

    useFlowStore.getState().updateNodeData(nodeId, {
      outputImages,
    })
  }

  const currentNode = useFlowStore.getState().nodes.find((item) => item.id === nodeId)
  const currentData = currentNode?.type === 'threeViewGen'
    ? (currentNode.data as ThreeViewGenNodeData)
    : data
  const nextSplitResultCache = {
    ...(currentData.splitResultCache ?? {}),
    [signature]: outputImages,
  }

  useFlowStore.getState().updateNodeData(nodeId, {
    status: 'success' as NodeStatus,
    progress: 100,
    outputImage: undefined,
    outputImages,
    errorMessage: undefined,
    lastRunSignature: signature,
    splitResultCache: nextSplitResultCache,
  })
  syncDownstreamAfterGeneration(nodeId)

  if (showSuccessMessage) {
    message.success('三视图生成完成')
  }
}
