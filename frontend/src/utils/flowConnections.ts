import type { Connection } from '@xyflow/react'

import type { AppEdge, AppNode, AppNodeType } from '../types'

export type HandleToneKind = 'image' | 'video' | 'context' | 'storyboard' | 'hybrid' | 'audio'

export interface NodeCatalogEntry {
  label: string
  description: string
}

export const NODE_CATALOG: Record<AppNodeType, NodeCatalogEntry> = {
  scene: {
    label: '场次',
    description: '组织剧情段落和镜头组',
  },
  shot: {
    label: '镜头',
    description: '故事板核心镜头，可直接生成',
  },
  character: {
    label: '角色',
    description: '定义可复用的人物设定',
  },
  style: {
    label: '风格',
    description: '统一视觉氛围与镜头语言',
  },
  continuity: {
    label: '九宫格动作',
    description: '拆解视频镜头的 9 格连续动作',
  },
  imageUpload: {
    label: '图片上传',
    description: '上传参考图或起始图',
  },
  imageGen: {
    label: '图片生成',
    description: '生成静态图像结果',
  },
  imageUnderstand: {
    label: '图片理解',
    description: '分析图片并生成场景描述提示词',
  },
  threeViewGen: {
    label: '三视图生成',
    description: '基于参考图生成角色三视图拼板',
  },
  imageDisplay: {
    label: '图片预览',
    description: '查看生成出的图像',
  },
  videoGen: {
    label: '视频生成',
    description: '基于上游图像生成动态片段',
  },
  videoEdit: {
    label: '视频编辑',
    description: '对视频进行编辑，支持风格变换、背景替换等',
  },
  videoDisplay: {
    label: '视频预览',
    description: '查看生成出的动态片段',
  },
  videoUpload: {
    label: '视频上传',
    description: '上传视频文件供下游使用',
  },
  animateMix: {
    label: '视频换人',
    description: '将视频中的人物替换为指定角色',
  },
  digitalHuman: {
    label: '数字人',
    description: '根据文本和角色图片生成数字人视频',
  },
  tts: {
    label: '文本转语音',
    description: '将文本合成为语音并导出音频',
  },
  imageUpscale: {
    label: '图片放大',
    description: '将低分辨率图片高清放大至目标分辨率',
  },
  videoConcat: {
    label: '视频拼接',
    description: '将多段视频首尾拼接为完整视频',
  },
  characterLib: {
    label: '人像库',
    description: '浏览和选择已生成的人物图片，支持生成新人像',
  },
}

const BASE_VALID_TARGETS: Partial<Record<AppNodeType, AppNodeType[]>> = {
  scene: ['shot', 'continuity'],
  character: ['shot', 'continuity'],
  style: ['shot', 'continuity'],
  imageUpload: ['imageGen', 'threeViewGen', 'videoGen', 'videoEdit', 'animateMix', 'character', 'shot', 'continuity', 'imageUnderstand', 'digitalHuman', 'imageUpscale'],
  imageGen: ['imageDisplay', 'threeViewGen', 'videoGen', 'character', 'shot', 'continuity', 'imageUnderstand', 'animateMix', 'digitalHuman', 'imageUpscale'],
  imageUnderstand: ['imageGen', 'videoGen', 'shot', 'continuity', 'imageDisplay'],
  threeViewGen: ['imageDisplay', 'videoGen', 'imageGen', 'character', 'shot', 'continuity', 'imageUnderstand', 'digitalHuman', 'imageUpscale'],
  videoGen: ['videoDisplay', 'videoEdit', 'animateMix', 'videoGen', 'videoConcat'],
  videoEdit: ['videoDisplay', 'videoGen', 'videoConcat'],
  animateMix: ['videoDisplay', 'videoEdit', 'videoConcat'],
  digitalHuman: ['videoDisplay', 'videoEdit', 'videoConcat'],
  videoUpload: ['videoEdit', 'videoDisplay', 'animateMix', 'videoGen', 'videoConcat'],
  tts: ['digitalHuman', 'videoGen'],
  imageUpscale: ['imageDisplay', 'videoGen', 'imageGen', 'shot', 'continuity'],
  videoConcat: ['videoDisplay', 'videoEdit'],
  characterLib: ['videoGen', 'imageDisplay', 'shot', 'continuity', 'digitalHuman', 'animateMix', 'imageUpscale'],
}

const HANDLE_TONE_STROKES: Record<HandleToneKind, string> = {
  image: '#1677ff',
  video: '#fa8c16',
  context: '#52c41a',
  storyboard: '#b8872b',
  hybrid: '#14b8a6',
  audio: '#722ed1',
}

const getShotOutputType = (node: Pick<AppNode, 'data'>): 'image' | 'video' =>
  (node.data as Record<string, unknown>).outputType === 'video' ? 'video' : 'image'

export const getConnectableTargetTypes = (sourceNode: AppNode | undefined): AppNodeType[] => {
  if (!sourceNode) {
    return []
  }

  if (sourceNode.type === 'shot') {
    return getShotOutputType(sourceNode) === 'video' ? ['videoDisplay', 'shot', 'videoEdit', 'animateMix', 'digitalHuman', 'videoConcat'] : ['imageDisplay', 'shot']
  }

  if (sourceNode.type === 'continuity') {
    return ['imageDisplay', 'videoGen', 'shot']
  }

  return [...(BASE_VALID_TARGETS[sourceNode.type] ?? [])]
}

export const getValidTargetNodeTypes = (
  sourceNodeId: string,
  nodes: AppNode[]
): AppNodeType[] => getConnectableTargetTypes(nodes.find((node) => node.id === sourceNodeId))

const normalizeConnection = (connection: Connection | AppEdge): Connection => ({
  source: connection.source,
  target: connection.target,
  sourceHandle: connection.sourceHandle ?? null,
  targetHandle: connection.targetHandle ?? null,
})

export const isValidConnection = (connectionLike: Connection | AppEdge, nodes: AppNode[], edges: AppEdge[]): boolean => {
  const connection = normalizeConnection(connectionLike)
  const sourceNode = nodes.find((node) => node.id === connection.source)
  const targetNode = nodes.find((node) => node.id === connection.target)

  if (!sourceNode || !targetNode) {
    return false
  }

  if (!getConnectableTargetTypes(sourceNode).includes(targetNode.type)) {
    return false
  }

  if (sourceNode.type === 'continuity' && targetNode.type === 'shot') {
    return !edges.some((edge) => {
      if (edge.target !== connection.target || edge.source === connection.source) {
        return false
      }

      const existingSourceNode = nodes.find((node) => node.id === edge.source)
      return existingSourceNode?.type === 'continuity'
    })
  }

  return true
}

export const getHandleToneKind = (
  nodeType: AppNodeType,
  handleType: 'source' | 'target',
  nodeData?: Record<string, unknown>
): HandleToneKind => {
  if (nodeType === 'shot' && handleType === 'source') {
    return nodeData?.outputType === 'video' ? 'video' : 'image'
  }

  if (nodeType === 'scene' || nodeType === 'style') {
    return 'context'
  }

  if (nodeType === 'imageUnderstand') {
    return handleType === 'target' ? 'image' : 'context'
  }

  if (nodeType === 'character') {
    return handleType === 'target' ? 'image' : 'context'
  }

  if (
    nodeType === 'imageUpload'
    || nodeType === 'imageGen'
    || nodeType === 'threeViewGen'
    || nodeType === 'imageDisplay'
  ) {
    return 'image'
  }

  if (nodeType === 'videoGen') {
    return handleType === 'target' ? 'image' : 'video'
  }

  if (nodeType === 'videoEdit') {
    return handleType === 'target' ? 'video' : 'video'
  }

  if (nodeType === 'videoDisplay') {
    return 'video'
  }

  if (nodeType === 'videoUpload') {
    return 'video'
  }

  if (nodeType === 'animateMix') {
    return 'video'
  }

  if (nodeType === 'digitalHuman') {
    return handleType === 'target' ? 'image' : 'video'
  }

  if (nodeType === 'tts') {
    return 'audio'
  }

  if (nodeType === 'characterLib') {
    return 'image'
  }

  if (nodeType === 'imageUpscale') {
    return 'image'
  }

  if (nodeType === 'videoConcat') {
    return 'video'
  }

  if (nodeType === 'continuity') {
    return 'hybrid'
  }

  return 'hybrid'
}

export const getHandleToneStroke = (toneKind: HandleToneKind): string => HANDLE_TONE_STROKES[toneKind]

export const getConnectionStroke = (sourceNode: Pick<AppNode, 'type' | 'data'> | null | undefined): string => {
  if (!sourceNode) {
    return HANDLE_TONE_STROKES.image
  }

  return HANDLE_TONE_STROKES[getHandleToneKind(sourceNode.type, 'source', sourceNode.data as Record<string, unknown>)]
}
