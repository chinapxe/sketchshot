import { create } from 'zustand'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react'
import { v4 as uuidv4 } from 'uuid'

import type {
  AppEdge,
  AppNode,
  AppNodeType,
  CharacterNodeData,
  CharacterThreeViewImages,
  ImageDisplayNodeData,
  ImageGenNodeData,
  ImageUploadNodeData,
  NodeStatus,
  SceneNodeData,
  ShotNodeData,
  StyleNodeData,
  VideoDisplayNodeData,
  VideoGenNodeData,
} from '../types'
import {
  buildGenerationSignature,
  buildShotGenerationSignature,
  buildVideoGenerationSignature,
} from '../utils/generationSignature'
import { CAMERA_ANGLE_OPTIONS, SHOT_SIZE_OPTIONS } from '../config/storyboardPresets'
import { MAX_CHARACTER_IDENTITY_STRENGTH } from '../utils/characterConsistency'
import { computeAutoLayoutNodes } from '../utils/canvasLayout'
import { getShotContext } from '../utils/storyboard'

const createDefaultNodeData = (type: AppNodeType): Record<string, unknown> => {
  switch (type) {
    case 'imageUpload':
      return {
        label: '图片上传',
        imageUrl: undefined,
        fileName: undefined,
        isUploading: false,
        uploadError: undefined,
      } satisfies ImageUploadNodeData
    case 'imageGen':
      return {
        label: '图片生成',
        prompt: '',
        aspectRatio: '1:1',
        resolution: '2K',
        adapter: 'volcengine',
        upstreamReferenceImages: [],
        manualReferenceImages: [],
        referenceImages: [],
        isUploadingReferences: false,
        referenceUploadError: undefined,
        identityLock: true,
        identityStrength: MAX_CHARACTER_IDENTITY_STRENGTH,
        status: 'idle' as NodeStatus,
        progress: 0,
        creditCost: 30,
        resultCache: {},
        needsRefresh: false,
      } satisfies ImageGenNodeData
    case 'imageDisplay':
      return {
        label: '图片预览',
        images: [],
        status: 'idle' as NodeStatus,
      } satisfies ImageDisplayNodeData
    case 'videoGen':
      return {
        label: '视频生成',
        prompt: '',
        aspectRatio: '16:9',
        durationSeconds: 4,
        motionStrength: 0.6,
        adapter: 'volcengine',
        sourceImages: [],
        status: 'idle' as NodeStatus,
        progress: 0,
        creditCost: 90,
        resultCache: {},
        needsRefresh: false,
      } satisfies VideoGenNodeData
    case 'videoDisplay':
      return {
        label: '视频预览',
        videos: [],
        status: 'idle' as NodeStatus,
      } satisfies VideoDisplayNodeData
    case 'scene':
      return {
        label: '场次',
        collapsed: false,
        title: '',
        synopsis: '',
        beat: '',
        notes: '',
      } satisfies SceneNodeData
    case 'character':
      return {
        label: '角色',
        collapsed: false,
        name: '',
        role: '',
        appearance: '',
        temperamentTags: [],
        stateTags: [],
        wardrobe: '',
        props: '',
        notes: '',
        referenceImages: [],
        threeViewImages: {},
      } satisfies CharacterNodeData
    case 'style':
      return {
        label: '风格',
        collapsed: false,
        name: '',
        keywords: '',
        palette: '',
        lighting: '',
        framing: '',
        styleTags: [],
        paletteTags: [],
        lightingTags: [],
        framingTags: [],
        qualityTags: [],
        notes: '',
      } satisfies StyleNodeData
    case 'shot':
      return {
        label: '镜头',
        collapsed: false,
        title: '',
        description: '',
        prompt: '',
        continuityFrames: Array.from({ length: 9 }, () => ''),
        videoFirstFrame: undefined,
        videoLastFrame: undefined,
        shotSize: 'medium',
        cameraAngle: 'eye-level',
        cameraMovement: '',
        composition: '',
        lightingStyle: '',
        moodTags: [],
        qualityTags: [],
        motion: '',
        emotion: '',
        aspectRatio: '16:9',
        resolution: '2K',
        outputType: 'image',
        imageAdapter: 'volcengine',
        videoAdapter: 'volcengine',
        durationSeconds: 4,
        motionStrength: 0.6,
        identityLock: true,
        identityStrength: MAX_CHARACTER_IDENTITY_STRENGTH,
        referenceImages: [],
        contextSignature: '',
        status: 'idle' as NodeStatus,
        progress: 0,
        creditCost: 30,
        resultCache: {},
        needsRefresh: false,
      } satisfies ShotNodeData
    default:
      return { label: '未知节点' }
  }
}

const cloneFlowState = (nodes: AppNode[], edges: AppEdge[]) => ({
  nodes: JSON.parse(JSON.stringify(nodes)) as AppNode[],
  edges: JSON.parse(JSON.stringify(edges)) as AppEdge[],
})

const dedupeStringList = (values: unknown): string[] => {
  if (!Array.isArray(values)) return []

  return Array.from(
    new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))
  )
}

const mergeStringLists = (...lists: unknown[]): string[] => dedupeStringList(lists.flat())

const shotSizeValues = new Set<string>(SHOT_SIZE_OPTIONS.map((option) => option.value))
const cameraAngleValues = new Set<string>(CAMERA_ANGLE_OPTIONS.map((option) => option.value))

const normalizeTextValue = (value: unknown): string => (typeof value === 'string' ? value : '')

const normalizeShotSize = (value: unknown): ShotNodeData['shotSize'] => {
  if (value === 'establishing') {
    return 'extreme-wide'
  }

  if (typeof value === 'string' && shotSizeValues.has(value)) {
    return value as ShotNodeData['shotSize']
  }

  return 'medium'
}

const normalizeCameraAngle = (value: unknown): ShotNodeData['cameraAngle'] => {
  if (typeof value === 'string' && cameraAngleValues.has(value)) {
    return value as ShotNodeData['cameraAngle']
  }

  return 'eye-level'
}

const normalizeImageGenData = (data: Partial<ImageGenNodeData>): ImageGenNodeData => {
  const legacyReferenceImages = dedupeStringList(data.referenceImages)
  const hasExplicitUpstreamReferences = Array.isArray(data.upstreamReferenceImages)
  const hasExplicitManualReferences = Array.isArray(data.manualReferenceImages)
  const upstreamReferenceImages = dedupeStringList(data.upstreamReferenceImages)
  const manualReferenceImages = hasExplicitManualReferences
    ? dedupeStringList(data.manualReferenceImages)
    : hasExplicitUpstreamReferences
      ? []
      : legacyReferenceImages
  const referenceImages = mergeStringLists(upstreamReferenceImages, manualReferenceImages)

  const restData = { ...data }
  delete restData.upstreamReferenceImages
  delete restData.manualReferenceImages
  delete restData.referenceImages
  delete restData.isUploadingReferences
  delete restData.referenceUploadError

  return {
    label: '图片生成',
    prompt: '',
    aspectRatio: '1:1',
    resolution: '2K',
    adapter: 'volcengine',
    upstreamReferenceImages,
    manualReferenceImages,
    referenceImages,
    isUploadingReferences: data.isUploadingReferences === true,
    referenceUploadError: typeof data.referenceUploadError === 'string' ? data.referenceUploadError : undefined,
    identityLock: true,
    identityStrength: MAX_CHARACTER_IDENTITY_STRENGTH,
    status: 'idle' as NodeStatus,
    progress: 0,
    creditCost: 30,
    resultCache: {},
    needsRefresh: false,
    ...restData,
  }
}

const normalizeVideoGenData = (data: Partial<VideoGenNodeData>): VideoGenNodeData => {
  const sourceImages = dedupeStringList(data.sourceImages)
  const restData = { ...data }
  delete restData.sourceImages

  return {
    label: '视频生成',
    prompt: '',
    aspectRatio: '16:9',
    durationSeconds: 4,
    motionStrength: 0.6,
    adapter: 'volcengine',
    sourceImages,
    status: 'idle' as NodeStatus,
    progress: 0,
    creditCost: 90,
    resultCache: {},
    needsRefresh: false,
    ...restData,
  }
}

const normalizeCharacterThreeViewImages = (
  referenceImages: string[],
  value: Partial<CharacterThreeViewImages> | undefined
): CharacterThreeViewImages => {
  const normalizedValue: CharacterThreeViewImages = {}
  const slots: Array<keyof CharacterThreeViewImages> = ['front', 'side', 'back']

  slots.forEach((slot) => {
    const candidate = typeof value?.[slot] === 'string' ? value[slot] : undefined
    if (candidate && referenceImages.includes(candidate)) {
      normalizedValue[slot] = candidate
    }
  })

  const used = new Set(Object.values(normalizedValue))
  const remaining = referenceImages.filter((imageUrl) => !used.has(imageUrl))

  slots.forEach((slot) => {
    if (!normalizedValue[slot] && remaining.length > 0) {
      normalizedValue[slot] = remaining.shift()
    }
  })

  return normalizedValue
}

const normalizeCharacterData = (data: Partial<CharacterNodeData>): CharacterNodeData => {
  const referenceImages = dedupeStringList(data.referenceImages)
  const temperamentTags = dedupeStringList(data.temperamentTags)
  const stateTags = dedupeStringList(data.stateTags)

  return {
    label: '角色',
    collapsed: data.collapsed === true,
    name: '',
    role: '',
    appearance: '',
    wardrobe: '',
    props: '',
    notes: '',
    ...data,
    temperamentTags,
    stateTags,
    referenceImages,
    threeViewImages: normalizeCharacterThreeViewImages(referenceImages, data.threeViewImages),
  }
}

/* const normalizeStyleData = (data: Partial<StyleNodeData>): StyleNodeData => ({
  label: 'é£Žæ ¼',
  collapsed: data.collapsed === true,
  name: '',
  keywords: '',
  palette: '',
  lighting: '',
  framing: '',
  notes: '',
  ...data,
  label: typeof data.label === 'string' ? data.label : '风格',
  styleTags: dedupeStringList(data.styleTags),
  paletteTags: dedupeStringList(data.paletteTags),
  lightingTags: dedupeStringList(data.lightingTags),
  framingTags: dedupeStringList(data.framingTags),
  qualityTags: dedupeStringList(data.qualityTags),
}) */

const normalizeStyleData = (data: Partial<StyleNodeData>): StyleNodeData => {
  const styleTags = dedupeStringList(data.styleTags)
  const paletteTags = dedupeStringList(data.paletteTags)
  const lightingTags = dedupeStringList(data.lightingTags)
  const framingTags = dedupeStringList(data.framingTags)
  const qualityTags = dedupeStringList(data.qualityTags)

  return {
    label: typeof data.label === 'string' ? data.label : '风格',
    collapsed: data.collapsed === true,
    name: '',
    keywords: '',
    palette: '',
    lighting: '',
    framing: '',
    notes: '',
    ...data,
    styleTags,
    paletteTags,
    lightingTags,
    framingTags,
    qualityTags,
  }
}

/* const normalizeShotData = (data: Partial<ShotNodeData>): ShotNodeData => {
  const referenceImages = dedupeStringList(data.referenceImages)
  const continuityFrames = Array.from({ length: 9 }, (_, index) => {
    const value = Array.isArray(data.continuityFrames) ? data.continuityFrames[index] : undefined
    return typeof value === 'string' ? value : ''
  })
  const videoFirstFrame =
    typeof data.videoFirstFrame === 'string' && referenceImages.includes(data.videoFirstFrame)
      ? data.videoFirstFrame
      : undefined
  const videoLastFrame =
    typeof data.videoLastFrame === 'string' && referenceImages.includes(data.videoLastFrame)
      ? data.videoLastFrame
      : undefined
  const restData = { ...data }
  delete restData.referenceImages
  delete restData.continuityFrames
  delete restData.videoFirstFrame
  delete restData.videoLastFrame
  delete restData.shotSize
  delete restData.cameraAngle
  delete restData.cameraMovement
  delete restData.composition
  delete restData.lightingStyle
  delete restData.moodTags
  delete restData.qualityTags

  const outputType = data.outputType ?? 'image'

  return {
    label: '镜头',
    collapsed: data.collapsed === true,
    title: '',
    description: '',
    prompt: '',
    continuityFrames,
    videoFirstFrame,
    videoLastFrame,
    shotSize: normalizeShotSize(data.shotSize),
    cameraAngle: normalizeCameraAngle(data.cameraAngle),
    cameraMovement: normalizeTextValue(data.cameraMovement),
    composition: normalizeTextValue(data.composition),
    lightingStyle: normalizeTextValue(data.lightingStyle),
    moodTags: dedupeStringList(data.moodTags),
    qualityTags: dedupeStringList(data.qualityTags),
    motion: '',
    emotion: '',
    aspectRatio: '16:9',
    resolution: '2K',
    outputType,
    imageAdapter: 'volcengine',
    videoAdapter: 'volcengine',
    durationSeconds: 4,
    motionStrength: 0.6,
    identityLock: true,
    identityStrength: MAX_CHARACTER_IDENTITY_STRENGTH,
    contextSignature: typeof data.contextSignature === 'string' ? data.contextSignature : '',
    status: 'idle' as NodeStatus,
    progress: 0,
    creditCost: outputType === 'video' ? 90 : 30,
    resultCache: {},
    needsRefresh: false,
    ...restData,
    referenceImages,
    shotSize: normalizeShotSize(restData.shotSize),
    cameraAngle: normalizeCameraAngle(restData.cameraAngle),
    cameraMovement: normalizeTextValue(restData.cameraMovement),
    composition: normalizeTextValue(restData.composition),
    lightingStyle: normalizeTextValue(restData.lightingStyle),
    moodTags: dedupeStringList(restData.moodTags),
    qualityTags: dedupeStringList(restData.qualityTags),
  }
} */

const normalizeShotData = (data: Partial<ShotNodeData>): ShotNodeData => {
  const referenceImages = dedupeStringList(data.referenceImages)
  const shotSize = normalizeShotSize(data.shotSize)
  const cameraAngle = normalizeCameraAngle(data.cameraAngle)
  const cameraMovement = normalizeTextValue(data.cameraMovement)
  const composition = normalizeTextValue(data.composition)
  const lightingStyle = normalizeTextValue(data.lightingStyle)
  const moodTags = dedupeStringList(data.moodTags)
  const qualityTags = dedupeStringList(data.qualityTags)
  const continuityFrames = Array.from({ length: 9 }, (_, index) => {
    const value = Array.isArray(data.continuityFrames) ? data.continuityFrames[index] : undefined
    return typeof value === 'string' ? value : ''
  })
  const videoFirstFrame =
    typeof data.videoFirstFrame === 'string' && referenceImages.includes(data.videoFirstFrame)
      ? data.videoFirstFrame
      : undefined
  const videoLastFrame =
    typeof data.videoLastFrame === 'string' && referenceImages.includes(data.videoLastFrame)
      ? data.videoLastFrame
      : undefined
  const restData = { ...data }
  delete restData.referenceImages
  delete restData.continuityFrames
  delete restData.videoFirstFrame
  delete restData.videoLastFrame

  const outputType = data.outputType ?? 'image'

  return {
    label: '镜头',
    collapsed: data.collapsed === true,
    title: '',
    description: '',
    prompt: '',
    continuityFrames,
    videoFirstFrame,
    videoLastFrame,
    shotSize,
    cameraAngle,
    cameraMovement,
    composition,
    lightingStyle,
    moodTags,
    qualityTags,
    motion: '',
    emotion: '',
    aspectRatio: '16:9',
    resolution: '2K',
    outputType,
    imageAdapter: 'volcengine',
    videoAdapter: 'volcengine',
    durationSeconds: 4,
    motionStrength: 0.6,
    identityLock: true,
    identityStrength: MAX_CHARACTER_IDENTITY_STRENGTH,
    contextSignature: typeof data.contextSignature === 'string' ? data.contextSignature : '',
    status: 'idle' as NodeStatus,
    progress: 0,
    creditCost: outputType === 'video' ? 90 : 30,
    resultCache: {},
    needsRefresh: false,
    ...restData,
    referenceImages,
  }
}

const syncImageGenDerivedState = (data: Partial<ImageGenNodeData>): ImageGenNodeData => {
  const normalizedData = normalizeImageGenData(data)
  const isGenerating = normalizedData.status === 'queued' || normalizedData.status === 'processing'
  const hasRun = Boolean(normalizedData.lastRunSignature)
  const currentSignature = buildGenerationSignature(normalizedData)

  return {
    ...normalizedData,
    identityLock: normalizedData.referenceImages.length > 0,
    identityStrength: MAX_CHARACTER_IDENTITY_STRENGTH,
    needsRefresh: hasRun && !isGenerating && currentSignature !== normalizedData.lastRunSignature,
  }
}

const syncVideoGenDerivedState = (data: Partial<VideoGenNodeData>): VideoGenNodeData => {
  const normalizedData = normalizeVideoGenData(data)
  const isGenerating = normalizedData.status === 'queued' || normalizedData.status === 'processing'
  const hasRun = Boolean(normalizedData.lastRunSignature)
  const currentSignature = buildVideoGenerationSignature(normalizedData)

  return {
    ...normalizedData,
    needsRefresh: hasRun && !isGenerating && currentSignature !== normalizedData.lastRunSignature,
  }
}

const syncShotDerivedState = (data: Partial<ShotNodeData>): ShotNodeData => {
  const normalizedData = normalizeShotData(data)
  const isGenerating = normalizedData.status === 'queued' || normalizedData.status === 'processing'
  const hasRun = Boolean(normalizedData.lastRunSignature)
  const currentSignature = buildShotGenerationSignature(normalizedData)

  return {
    ...normalizedData,
    identityLock: normalizedData.outputType === 'image' && normalizedData.referenceImages.length > 0,
    identityStrength: MAX_CHARACTER_IDENTITY_STRENGTH,
    needsRefresh: hasRun && !isGenerating && currentSignature !== normalizedData.lastRunSignature,
  }
}

const isValidConnection = (connection: Connection, nodes: AppNode[]): boolean => {
  const sourceNode = nodes.find((node) => node.id === connection.source)
  const targetNode = nodes.find((node) => node.id === connection.target)
  if (!sourceNode || !targetNode) return false

  if (sourceNode.type === 'shot') {
    const outputType = (sourceNode.data as ShotNodeData).outputType ?? 'image'
    const allowedTargets = outputType === 'video' ? ['videoDisplay', 'shot'] : ['imageDisplay', 'shot']
    return allowedTargets.includes(targetNode.type || '')
  }

  const validConnections: Record<string, string[]> = {
    scene: ['shot'],
    character: ['shot'],
    style: ['shot'],
    imageUpload: ['imageGen', 'videoGen', 'character', 'shot'],
    imageGen: ['imageDisplay', 'videoGen', 'character', 'shot'],
    videoGen: ['videoDisplay'],
  }

  const allowedTargets = validConnections[sourceNode.type || '']
  return allowedTargets ? allowedTargets.includes(targetNode.type || '') : false
}

interface FlowState {
  nodes: AppNode[]
  edges: AppEdge[]
  currentWorkflowId: string | null
  currentWorkflowName: string
  isWorkflowExecuting: boolean
  activeExecutionNodeId: string | null
  onNodesChange: OnNodesChange<AppNode>
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  addNode: (type: AppNodeType, position: { x: number; y: number }) => void
  updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void
  deleteNode: (nodeId: string) => void
  cloneNode: (nodeId: string) => void
  toggleNodeCollapsed: (nodeId: string) => void
  toggleNodeDisabled: (nodeId: string) => void
  getUpstreamImages: (nodeId: string) => string[]
  getUpstreamVideos: (nodeId: string) => string[]
  syncDownstream: (sourceNodeId: string) => void
  updateNodeWidth: (nodeId: string, width: number) => void
  selectAll: () => void
  autoLayout: () => void
  clearCanvas: () => void
  setWorkflowMeta: (workflowId: string | null, workflowName: string) => void
  setWorkflowExecutionState: (isExecuting: boolean, activeNodeId?: string | null) => void
  loadWorkflow: (workflow: { id: string | null; name: string; nodes: AppNode[]; edges: AppEdge[] }) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  _history: Array<{ nodes: AppNode[]; edges: AppEdge[] }>
  _historyIndex: number
  _pushHistory: () => void
}

const MAX_HISTORY = 50

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],
  currentWorkflowId: null,
  currentWorkflowName: '未命名工作流',
  isWorkflowExecuting: false,
  activeExecutionNodeId: null,
  canUndo: false,
  canRedo: false,
  _history: [],
  _historyIndex: -1,

  _pushHistory: () => {
    const { nodes, edges, _history, _historyIndex } = get()
    const newHistory = _history.slice(0, _historyIndex + 1)
    newHistory.push(cloneFlowState(nodes, edges))

    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift()
    }

    set({
      _history: newHistory,
      _historyIndex: newHistory.length - 1,
      canUndo: newHistory.length > 1,
      canRedo: false,
    })
  },

  onNodesChange: (changes: NodeChange<AppNode>[]) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) })
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    set({ edges: applyEdgeChanges(changes, get().edges) })
  },

  onConnect: (connection: Connection) => {
    const { nodes, edges, _pushHistory, syncDownstream } = get()
    if (!isValidConnection(connection, nodes)) {
      console.warn('[flow] rejected invalid connection')
      return
    }

    _pushHistory()
    const newEdges = addEdge({ ...connection, type: 'smoothstep', animated: true }, edges)
    set({ edges: newEdges })

    if (connection.source) {
      setTimeout(() => syncDownstream(connection.source!), 0)
    }
  },

  addNode: (type: AppNodeType, position: { x: number; y: number }) => {
    get()._pushHistory()
    const newNode = {
      id: uuidv4(),
      type,
      position,
      data: createDefaultNodeData(type),
    } as AppNode

    set({ nodes: [...get().nodes, newNode] })
  },

  updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id !== nodeId) return node

        const mergedData = { ...node.data, ...data }

        if (node.type === 'imageGen') {
          return {
            ...node,
            data: syncImageGenDerivedState(mergedData as Partial<ImageGenNodeData>),
          } as AppNode
        }

        if (node.type === 'videoGen') {
          return {
            ...node,
            data: syncVideoGenDerivedState(mergedData as Partial<VideoGenNodeData>),
          } as AppNode
        }

        if (node.type === 'character') {
          return {
            ...node,
            data: normalizeCharacterData(mergedData as Partial<CharacterNodeData>),
          } as AppNode
        }

        if (node.type === 'style') {
          return {
            ...node,
            data: normalizeStyleData(mergedData as Partial<StyleNodeData>),
          } as AppNode
        }

        if (node.type === 'shot') {
          return {
            ...node,
            data: syncShotDerivedState(mergedData as Partial<ShotNodeData>),
          } as AppNode
        }

        return { ...node, data: mergedData } as AppNode
      }),
    })

    setTimeout(() => get().syncDownstream(nodeId), 0)
  },

  deleteNode: (nodeId: string) => {
    get()._pushHistory()
    set({
      nodes: get().nodes.filter((node) => node.id !== nodeId),
      edges: get().edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    })
  },

  cloneNode: (nodeId: string) => {
    const sourceNode = get().nodes.find((node) => node.id === nodeId)
    if (!sourceNode) return

    get()._pushHistory()
    const clonedNode = {
      ...sourceNode,
      id: uuidv4(),
      position: {
        x: sourceNode.position.x + 40,
        y: sourceNode.position.y + 40,
      },
      data: JSON.parse(JSON.stringify(sourceNode.data)),
      selected: false,
    } as AppNode

    set({ nodes: [...get().nodes, clonedNode] })
  },

  toggleNodeCollapsed: (nodeId: string) => {
    const node = get().nodes.find((item) => item.id === nodeId)
    if (!node) return

    get()._pushHistory()
    const isCurrentlyCollapsed = (node.data as Record<string, unknown>).collapsed === true

    set({
      nodes: get().nodes.map((item) =>
        item.id === nodeId
          ? ({ ...item, data: { ...item.data, collapsed: !isCurrentlyCollapsed } } as AppNode)
          : item
      ),
    })
  },

  toggleNodeDisabled: (nodeId: string) => {
    const node = get().nodes.find((item) => item.id === nodeId)
    if (!node) return

    get()._pushHistory()
    const isCurrentlyDisabled = (node.data as Record<string, unknown>).disabled === true
    set({
      nodes: get().nodes.map((item) =>
        item.id === nodeId
          ? ({ ...item, data: { ...item.data, disabled: !isCurrentlyDisabled } } as AppNode)
          : item
      ),
    })
  },

  getUpstreamImages: (nodeId: string): string[] => {
    const { nodes, edges } = get()
    const incomingEdges = edges.filter((edge) => edge.target === nodeId)
    const images: string[] = []

    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((node) => node.id === edge.source)
      if (!sourceNode) continue
      if ((sourceNode.data as Record<string, unknown>).disabled === true) continue

      if (sourceNode.type === 'imageUpload') {
        const data = sourceNode.data as ImageUploadNodeData
        if (data.imageUrl) images.push(data.imageUrl)
      } else if (sourceNode.type === 'imageGen') {
        const data = sourceNode.data as ImageGenNodeData
        if (data.outputImage) images.push(data.outputImage)
      } else if (sourceNode.type === 'shot') {
        const data = sourceNode.data as ShotNodeData
        if (data.outputType === 'image' && data.outputImage) images.push(data.outputImage)
      }
    }

    return dedupeStringList(images)
  },

  getUpstreamVideos: (nodeId: string): string[] => {
    const { nodes, edges } = get()
    const incomingEdges = edges.filter((edge) => edge.target === nodeId)
    const videos: string[] = []

    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((node) => node.id === edge.source)
      if (!sourceNode) continue
      if ((sourceNode.data as Record<string, unknown>).disabled === true) continue

      if (sourceNode.type === 'videoGen') {
        const data = sourceNode.data as VideoGenNodeData
        if (data.outputVideo) videos.push(data.outputVideo)
      } else if (sourceNode.type === 'shot') {
        const data = sourceNode.data as ShotNodeData
        if (data.outputType === 'video' && data.outputVideo) videos.push(data.outputVideo)
      }
    }

    return dedupeStringList(videos)
  },

  syncDownstream: (sourceNodeId: string) => {
    const { nodes, edges, updateNodeData, getUpstreamImages, getUpstreamVideos } = get()
    const downstreamEdges = edges.filter((edge) => edge.source === sourceNodeId)

    for (const edge of downstreamEdges) {
      const targetNode = nodes.find((node) => node.id === edge.target)
      if (!targetNode) continue

      if (targetNode.type === 'imageGen') {
        updateNodeData(edge.target, { upstreamReferenceImages: getUpstreamImages(edge.target) })
        continue
      }

      if (targetNode.type === 'videoGen') {
        updateNodeData(edge.target, { sourceImages: getUpstreamImages(edge.target) })
        continue
      }

      if (targetNode.type === 'character') {
        updateNodeData(edge.target, { referenceImages: getUpstreamImages(edge.target) })
        continue
      }

      if (targetNode.type === 'shot') {
        const shotContext = getShotContext(edge.target, nodes, edges)
        updateNodeData(edge.target, {
          referenceImages: shotContext.referenceImages,
          contextSignature: shotContext.contextSignature,
        })
        continue
      }

      if (targetNode.type === 'imageDisplay') {
        updateNodeData(edge.target, { images: getUpstreamImages(edge.target) })
        continue
      }

      if (targetNode.type === 'videoDisplay') {
        updateNodeData(edge.target, { videos: getUpstreamVideos(edge.target) })
      }
    }
  },

  updateNodeWidth: (nodeId: string, width: number) => {
    set({
      nodes: get().nodes.map((node) =>
        node.id === nodeId
          ? ({
              ...node,
              data: {
                ...node.data,
                nodeWidth: width,
              },
            } as AppNode)
          : node
      ),
    })
  },

  selectAll: () => {
    set({
      nodes: get().nodes.map((node) => ({ ...node, selected: true } as AppNode)),
      edges: get().edges.map((edge) => ({ ...edge, selected: true } as AppEdge)),
    })
  },

  autoLayout: () => {
    const { nodes, edges } = get()
    if (nodes.length <= 1) return

    get()._pushHistory()
    set({
      nodes: computeAutoLayoutNodes(nodes, edges),
      edges: edges.map((edge) => ({ ...edge, selected: false } as AppEdge)),
    })
  },

  clearCanvas: () => {
    if (get().nodes.length === 0 && get().edges.length === 0) return

    get()._pushHistory()
    set({ nodes: [], edges: [] })
  },

  setWorkflowMeta: (workflowId: string | null, workflowName: string) => {
    set({
      currentWorkflowId: workflowId,
      currentWorkflowName: workflowName,
    })
  },

  setWorkflowExecutionState: (isExecuting: boolean, activeNodeId: string | null = null) => {
    set({
      isWorkflowExecuting: isExecuting,
      activeExecutionNodeId: isExecuting ? activeNodeId : null,
    })
  },

  loadWorkflow: (workflow) => {
    const initialNormalizedNodes = workflow.nodes.map((node) => {
      if (node.type === 'imageGen') {
        return {
          ...node,
          selected: false,
          data: syncImageGenDerivedState(node.data as Partial<ImageGenNodeData>),
        } as AppNode
      }

      if (node.type === 'videoGen') {
        return {
          ...node,
          selected: false,
          data: syncVideoGenDerivedState(node.data as Partial<VideoGenNodeData>),
        } as AppNode
      }

      if (node.type === 'character') {
        return {
          ...node,
          selected: false,
          data: normalizeCharacterData(node.data as Partial<CharacterNodeData>),
        } as AppNode
      }

      if (node.type === 'style') {
        return {
          ...node,
          selected: false,
          data: normalizeStyleData(node.data as Partial<StyleNodeData>),
        } as AppNode
      }

      if (node.type === 'shot') {
        return {
          ...node,
          selected: false,
          data: syncShotDerivedState(node.data as Partial<ShotNodeData>),
        } as AppNode
      }

      return { ...node, selected: false } as AppNode
    })

    const normalizedEdges = workflow.edges.map((edge) => ({ ...edge, selected: false } as AppEdge))
    const normalizedNodes = initialNormalizedNodes.map((node) => {
      if (node.type === 'character') {
        return {
          ...node,
          data: normalizeCharacterData({
            ...(node.data as CharacterNodeData),
            referenceImages: getShotContext(node.id, initialNormalizedNodes, normalizedEdges).referenceImages,
          }),
        } as AppNode
      }

      if (node.type === 'shot') {
        const shotContext = getShotContext(node.id, initialNormalizedNodes, normalizedEdges)
        return {
          ...node,
          data: syncShotDerivedState({
            ...(node.data as ShotNodeData),
            referenceImages: shotContext.referenceImages,
            contextSignature: shotContext.contextSignature,
          }),
        } as AppNode
      }

      return node
    })

    const initialHistory = cloneFlowState(normalizedNodes, normalizedEdges)

    set({
      nodes: normalizedNodes,
      edges: normalizedEdges,
      currentWorkflowId: workflow.id,
      currentWorkflowName: workflow.name,
      isWorkflowExecuting: false,
      activeExecutionNodeId: null,
      _history: [initialHistory],
      _historyIndex: 0,
      canUndo: false,
      canRedo: false,
    })
  },

  undo: () => {
    const { _history, _historyIndex } = get()
    if (_historyIndex <= 0) return

    const prevIndex = _historyIndex - 1
    const prevState = _history[prevIndex]

    set({
      nodes: JSON.parse(JSON.stringify(prevState.nodes)),
      edges: JSON.parse(JSON.stringify(prevState.edges)),
      _historyIndex: prevIndex,
      canUndo: prevIndex > 0,
      canRedo: true,
    })
  },

  redo: () => {
    const { _history, _historyIndex } = get()
    if (_historyIndex >= _history.length - 1) return

    const nextIndex = _historyIndex + 1
    const nextState = _history[nextIndex]

    set({
      nodes: JSON.parse(JSON.stringify(nextState.nodes)),
      edges: JSON.parse(JSON.stringify(nextState.edges)),
      _historyIndex: nextIndex,
      canUndo: true,
      canRedo: nextIndex < _history.length - 1,
    })
  },
}))
