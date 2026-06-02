import { imageUnderstandApi, imageUnderstandPromptApi } from './api'
import { useFlowStore } from '../stores/useFlowStore'
import type { ImageUnderstandNodeData } from '../types'

export async function executeImageUnderstandNode(nodeId: string): Promise<void> {
  const store = useFlowStore.getState()
  const node = store.nodes.find((n) => n.id === nodeId)

  if (!node || node.type !== 'imageUnderstand') {
    throw new Error('目标节点不存在，或不是图片理解节点')
  }

  const data = node.data as ImageUnderstandNodeData
  if (!data.imageUrl) {
    throw new Error('请先连接图片输入')
  }

  store.updateNodeData(nodeId, {
    isGenerating: true,
    errorMessage: undefined,
    description: undefined,
    generatedPrompt: undefined,
    isGeneratingPrompt: false,
  })

  try {
    const result = await imageUnderstandApi({ image_url: data.imageUrl })
    store.updateNodeData(nodeId, {
      description: result.description,
      isGenerating: false,
    })
    store.syncDownstream(nodeId)
  } catch (error) {
    store.updateNodeData(nodeId, {
      isGenerating: false,
      errorMessage: error instanceof Error ? error.message : '图片理解生成失败',
    })
  }
}

export async function executeUnderstandPromptNode(nodeId: string): Promise<void> {
  const store = useFlowStore.getState()
  const node = store.nodes.find((n) => n.id === nodeId)

  if (!node || node.type !== 'imageUnderstand') {
    throw new Error('目标节点不存在，或不是图片理解节点')
  }

  const data = node.data as ImageUnderstandNodeData
  if (!data.description) {
    throw new Error('请先生成场景描述')
  }

  store.updateNodeData(nodeId, {
    isGeneratingPrompt: true,
    errorMessage: undefined,
  })

  try {
    const result = await imageUnderstandPromptApi({ description: data.description })
    store.updateNodeData(nodeId, {
      generatedPrompt: result.prompt,
      isGeneratingPrompt: false,
    })
    store.syncDownstream(nodeId)
  } catch (error) {
    store.updateNodeData(nodeId, {
      isGeneratingPrompt: false,
      errorMessage: error instanceof Error ? error.message : '提示词生成失败',
    })
  }
}
