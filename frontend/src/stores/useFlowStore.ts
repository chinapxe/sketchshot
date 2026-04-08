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
  ContinuityNodeData,
  ImageDisplayNodeData,
  ImageGenNodeData,
  ImageUploadNodeData,
  NodeCreationData,
  NodeStatus,
  SceneNodeData,
  ShotNodeData,
  StyleNodeData,
  ThreeViewGenNodeData,
  VideoDisplayNodeData,
  VideoGenNodeData,
} from '../types'
import {
  buildContinuityGenerationSignature,
  buildGenerationSignature,
  buildShotGenerationSignature,
  buildThreeViewGenerationSignature,
  buildVideoGenerationSignature,
} from '../utils/generationSignature'
import { isValidConnection } from '../utils/flowConnections'
import { CAMERA_ANGLE_OPTIONS, SHOT_SIZE_OPTIONS } from '../config/storyboardPresets'
import { MAX_CHARACTER_IDENTITY_STRENGTH } from '../utils/characterConsistency'
import { computeAutoLayoutNodes } from '../utils/canvasLayout'
import { getContinuityContext, getShotContext } from '../utils/storyboard'
import {
  getCharacterThreeViewSlotFromHandleId,
  getPrimaryThreeViewOutputImage,
  getThreeViewOutputImagesForHandle,
  getThreeViewOutputMode,
  getThreeViewSlotFromHandleId,
  normalizeLooseThreeViewImages,
} from '../utils/threeView'

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
    case 'threeViewGen':
      return {
        label: '三视图生成',
        prompt: '',
        aspectRatio: '16:9',
        resolution: '2K',
        adapter: 'volcengine',
        referenceImages: [],
        outputMode: 'sheet',
        status: 'idle' as NodeStatus,
        progress: 0,
        creditCost: 30,
        outputImages: {},
        resultCache: {},
        splitResultCache: {},
        needsRefresh: false,
      } satisfies ThreeViewGenNodeData
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
        threeViewSheetImage: undefined,
        threeViewImages: {},
        generatedThreeViewImages: undefined,
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
    case 'continuity':
      return {
        label: '九宫格动作',
        collapsed: false,
        prompt: '',
        frames: Array.from({ length: 9 }, () => ''),
        aspectRatio: '1:1',
        resolution: '2K',
        adapter: 'volcengine',
        contextSignature: '',
        status: 'idle' as NodeStatus,
        progress: 0,
        creditCost: 30,
        resultCache: {},
        needsRefresh: false,
      } satisfies ContinuityNodeData
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

const createNodeData = (type: AppNodeType, initialData: NodeCreationData = {}): Record<string, unknown> => {
  const mergedData = {
    ...createDefaultNodeData(type),
    ...initialData,
  }

  switch (type) {
    case 'imageGen':
      return syncImageGenDerivedState(mergedData as Partial<ImageGenNodeData>)
    case 'threeViewGen':
      return syncThreeViewGenDerivedState(mergedData as Partial<ThreeViewGenNodeData>)
    case 'videoGen':
      return syncVideoGenDerivedState(mergedData as Partial<VideoGenNodeData>)
    case 'character':
      return normalizeCharacterData(mergedData as Partial<CharacterNodeData>)
    case 'style':
      return normalizeStyleData(mergedData as Partial<StyleNodeData>)
    case 'continuity':
      return syncContinuityDerivedState(mergedData as Partial<ContinuityNodeData>)
    case 'shot':
      return syncShotDerivedState(mergedData as Partial<ShotNodeData>)
    default:
      return mergedData
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

const normalizeFrameGrid = (value: unknown): string[] => {
  return Array.from({ length: 9 }, (_, index) => {
    const frame = Array.isArray(value) ? value[index] : undefined
    return typeof frame === 'string' ? frame : ''
  })
}

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

const normalizeThreeViewGenData = (data: Partial<ThreeViewGenNodeData>): ThreeViewGenNodeData => {
  const referenceImages = dedupeStringList(data.referenceImages)
  const resultCache = typeof data.resultCache === 'object' && data.resultCache !== null
    ? { ...(data.resultCache as Record<string, string>) }
    : {}
  const splitResultCache = typeof data.splitResultCache === 'object' && data.splitResultCache !== null
    ? Object.fromEntries(
        Object.entries(data.splitResultCache as Record<string, CharacterThreeViewImages>).map(([key, value]) => [
          key,
          normalizeLooseThreeViewImages(value),
        ])
      )
    : {}

  return {
    label: '三视图生成',
    prompt: '',
    aspectRatio: '16:9',
    resolution: '2K',
    adapter: 'volcengine',
    status: 'idle' as NodeStatus,
    progress: 0,
    creditCost: 30,
    resultCache,
    splitResultCache,
    needsRefresh: false,
    ...data,
    referenceImages,
    outputMode: data.outputMode === 'split' ? 'split' : 'sheet',
    outputImage: typeof data.outputImage === 'string' ? data.outputImage : undefined,
    outputImages: normalizeLooseThreeViewImages(data.outputImages),
    lastRunSignature: typeof data.lastRunSignature === 'string' ? data.lastRunSignature : undefined,
    errorMessage: typeof data.errorMessage === 'string' ? data.errorMessage : undefined,
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
    if (candidate && candidate.length > 0) {
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
  const threeViewSheetImage =
    typeof data.threeViewSheetImage === 'string' && data.threeViewSheetImage.length > 0
      ? data.threeViewSheetImage
      : undefined
  const generatedThreeViewImages = normalizeLooseThreeViewImages(data.generatedThreeViewImages)

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
    threeViewSheetImage,
    threeViewImages: normalizeCharacterThreeViewImages(referenceImages, data.threeViewImages),
    generatedThreeViewImages:
      Object.keys(generatedThreeViewImages).length > 0 ? generatedThreeViewImages : undefined,
  }
}

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

const normalizeContinuityData = (data: Partial<ContinuityNodeData>): ContinuityNodeData => {
  const resultCache = typeof data.resultCache === 'object' && data.resultCache !== null
    ? { ...(data.resultCache as Record<string, string>) }
    : {}

  return {
    label: typeof data.label === 'string' ? data.label : '九宫格动作',
    collapsed: data.collapsed === true,
    ...data,
    prompt: normalizeTextValue(data.prompt),
    aspectRatio: data.aspectRatio ?? '1:1',
    resolution: data.resolution ?? '2K',
    adapter: data.adapter ?? 'volcengine',
    contextSignature: typeof data.contextSignature === 'string' ? data.contextSignature : '',
    status: data.status ?? ('idle' as NodeStatus),
    progress: typeof data.progress === 'number' ? data.progress : 0,
    creditCost: typeof data.creditCost === 'number' ? data.creditCost : 30,
    outputImage: typeof data.outputImage === 'string' ? data.outputImage : undefined,
    lastRunSignature: typeof data.lastRunSignature === 'string' ? data.lastRunSignature : undefined,
    resultCache,
    needsRefresh: data.needsRefresh === true,
    errorMessage: typeof data.errorMessage === 'string' ? data.errorMessage : undefined,
    frames: normalizeFrameGrid(data.frames),
  }
}

/* const normalizeShotData = (data: Partial<ShotNodeData>): ShotNodeData => {
  const referenceImages = dedupeStringList(data.referenceImages)
  const continuityFrames = normalizeFrameGrid(data.continuityFrames)
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

const syncThreeViewGenDerivedState = (data: Partial<ThreeViewGenNodeData>): ThreeViewGenNodeData => {
  const normalizedData = normalizeThreeViewGenData(data)
  const isGenerating = normalizedData.status === 'queued' || normalizedData.status === 'processing'
  const hasRun = Boolean(normalizedData.lastRunSignature)
  const currentSignature = buildThreeViewGenerationSignature(normalizedData)

  return {
    ...normalizedData,
    creditCost: normalizedData.outputMode === 'split' ? 90 : 30,
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

const syncContinuityDerivedState = (data: Partial<ContinuityNodeData>): ContinuityNodeData => {
  const normalizedData = normalizeContinuityData(data)
  const isGenerating = normalizedData.status === 'queued' || normalizedData.status === 'processing'
  const hasRun = Boolean(normalizedData.lastRunSignature)
  const currentSignature = buildContinuityGenerationSignature(normalizedData)

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

function getSourceNodeOutputImages(sourceNode: AppNode, sourceHandle?: string | null): string[] {
  if ((sourceNode.data as Record<string, unknown>).disabled === true) {
    return []
  }

  if (sourceNode.type === 'imageUpload') {
    const data = sourceNode.data as ImageUploadNodeData
    return data.imageUrl ? [data.imageUrl] : []
  }

  if (sourceNode.type === 'imageGen') {
    const data = sourceNode.data as ImageGenNodeData
    return data.outputImage ? [data.outputImage] : []
  }

  if (sourceNode.type === 'threeViewGen') {
    const data = sourceNode.data as ThreeViewGenNodeData
    return getThreeViewOutputImagesForHandle(data, sourceHandle)
  }

  if (sourceNode.type === 'continuity') {
    const data = sourceNode.data as ContinuityNodeData
    return data.outputImage ? [data.outputImage] : []
  }

  if (sourceNode.type === 'shot') {
    const data = sourceNode.data as ShotNodeData
    return data.outputType === 'image' && data.outputImage ? [data.outputImage] : []
  }

  return []
}

function getCharacterInputSyncData(
  nodeId: string,
  nodes: AppNode[],
  edges: AppEdge[]
): Pick<CharacterNodeData, 'referenceImages' | 'threeViewSheetImage' | 'generatedThreeViewImages' | 'threeViewImages'> {
  const targetNode = nodes.find((node) => node.id === nodeId && node.type === 'character')
  const existingThreeViewImages =
    targetNode?.type === 'character' ? normalizeLooseThreeViewImages(targetNode.data.threeViewImages) : {}
  const incomingEdges = edges.filter((edge) => edge.target === nodeId)
  const referenceImages: string[] = []
  let threeViewSheetImage: string | undefined
  const generatedThreeViewImages: CharacterThreeViewImages = {}
  const syncedThreeViewImages: CharacterThreeViewImages = {}

  for (const edge of incomingEdges) {
    const sourceNode = nodes.find((node) => node.id === edge.source)
    if (!sourceNode) continue
    const targetSlot = getCharacterThreeViewSlotFromHandleId(edge.targetHandle)

    if (sourceNode.type === 'threeViewGen') {
      const data = sourceNode.data as ThreeViewGenNodeData

      if (getThreeViewOutputMode(data) === 'split') {
        const sourceSlot = getThreeViewSlotFromHandleId(edge.sourceHandle)
        const outputSlot = sourceSlot ?? targetSlot
        const mappedSlot = targetSlot ?? sourceSlot

        if (outputSlot && mappedSlot) {
          const slotImage = data.outputImages?.[outputSlot]
          if (slotImage) {
            generatedThreeViewImages[mappedSlot] = slotImage
            syncedThreeViewImages[mappedSlot] = slotImage
          }
        } else {
          const normalizedOutputImages = normalizeLooseThreeViewImages(data.outputImages)
          Object.assign(generatedThreeViewImages, normalizedOutputImages)
          Object.assign(syncedThreeViewImages, normalizedOutputImages)
        }
      } else {
        if (!getThreeViewSlotFromHandleId(edge.sourceHandle)) {
          threeViewSheetImage = getPrimaryThreeViewOutputImage(data)
        }
      }
      continue
    }

    const outputImages = getSourceNodeOutputImages(sourceNode, edge.sourceHandle)
    if (targetSlot && outputImages[0]) {
      syncedThreeViewImages[targetSlot] = outputImages[0]
    }
    referenceImages.push(...outputImages)
  }

  const normalizedReferenceImages = dedupeStringList(referenceImages)
  const allowedThreeViewUrls = new Set<string>([
    ...normalizedReferenceImages,
    ...Object.values(generatedThreeViewImages),
  ])
  const preservedThreeViewImages = Object.fromEntries(
    Object.entries(existingThreeViewImages).filter(([, imageUrl]) => allowedThreeViewUrls.has(imageUrl))
  ) as CharacterThreeViewImages
  const threeViewImages: CharacterThreeViewImages = {
    ...preservedThreeViewImages,
    ...syncedThreeViewImages,
  }

  return {
    referenceImages: normalizedReferenceImages,
    threeViewSheetImage,
    threeViewImages,
    generatedThreeViewImages:
      Object.keys(generatedThreeViewImages).length > 0 ? generatedThreeViewImages : undefined,
  }
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
  addNode: (type: AppNodeType, position: { x: number; y: number }, initialData?: NodeCreationData) => void
  createConnectedNode: (
    sourceNodeId: string,
    type: AppNodeType,
    position: { x: number; y: number },
    sourceHandle?: string | null,
    initialData?: NodeCreationData
  ) => void
  updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void
  deleteNode: (nodeId: string) => void
  deleteEdge: (edgeId: string) => void
  cloneNode: (nodeId: string) => void
  toggleNodeCollapsed: (nodeId: string) => void
  toggleNodeDisabled: (nodeId: string) => void
  getUpstreamImages: (nodeId: string) => string[]
  getUpstreamVideos: (nodeId: string) => string[]
  syncDownstream: (sourceNodeId: string) => void
  updateNodeWidth: (nodeId: string, width: number) => void
  selectNode: (nodeId: string | null) => void
  selectEdge: (edgeId: string | null) => void
  clearSelection: () => void
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
    const currentEdges = get().edges
    const nextEdges = applyEdgeChanges(changes, currentEdges)
    set({ edges: nextEdges })

    const removedTargets = currentEdges
      .filter((edge) => !nextEdges.some((nextEdge) => nextEdge.id === edge.id))
      .map((edge) => edge.target)

    if (removedTargets.length > 0) {
      setTimeout(() => {
        const { nodes, edges, getUpstreamImages, getUpstreamVideos } = get()

        removedTargets.forEach((targetNodeId) => {
          const targetNode = nodes.find((node) => node.id === targetNodeId)
          if (!targetNode) return

          if (targetNode.type === 'imageGen') {
            get().updateNodeData(targetNodeId, { upstreamReferenceImages: getUpstreamImages(targetNodeId) })
            return
          }

          if (targetNode.type === 'threeViewGen') {
            get().updateNodeData(targetNodeId, { referenceImages: getUpstreamImages(targetNodeId) })
            return
          }

          if (targetNode.type === 'videoGen') {
            get().updateNodeData(targetNodeId, { sourceImages: getUpstreamImages(targetNodeId) })
            return
          }

          if (targetNode.type === 'character') {
            get().updateNodeData(targetNodeId, getCharacterInputSyncData(targetNodeId, nodes, edges))
            return
          }

          if (targetNode.type === 'continuity') {
            const continuityContext = getContinuityContext(targetNodeId, nodes, get().edges)
            get().updateNodeData(targetNodeId, {
              contextSignature: continuityContext.contextSignature,
            })
            return
          }

          if (targetNode.type === 'shot') {
            const shotContext = getShotContext(targetNodeId, nodes, get().edges)
            get().updateNodeData(targetNodeId, {
              referenceImages: shotContext.referenceImages,
              contextSignature: shotContext.contextSignature,
            })
            return
          }

          if (targetNode.type === 'imageDisplay') {
            get().updateNodeData(targetNodeId, { images: getUpstreamImages(targetNodeId) })
            return
          }

          if (targetNode.type === 'videoDisplay') {
            get().updateNodeData(targetNodeId, { videos: getUpstreamVideos(targetNodeId) })
          }
        })
      }, 0)
    }
  },

  onConnect: (connection: Connection) => {
    const { nodes, edges, _pushHistory, syncDownstream } = get()
    if (!isValidConnection(connection, nodes, edges)) {
      console.warn('[flow] rejected invalid connection')
      return
    }

    _pushHistory()
    const newEdges = addEdge({ ...connection, type: 'smoothstep', animated: false }, edges)
    set({ edges: newEdges })

    if (connection.source) {
      setTimeout(() => syncDownstream(connection.source!), 0)
    }
  },

  addNode: (type: AppNodeType, position: { x: number; y: number }, initialData?: NodeCreationData) => {
    get()._pushHistory()
    const newNode = {
      id: uuidv4(),
      type,
      position,
      data: createNodeData(type, initialData),
    } as AppNode

    set({ nodes: [...get().nodes, newNode] })
  },

  createConnectedNode: (
    sourceNodeId: string,
    type: AppNodeType,
    position: { x: number; y: number },
    sourceHandle?: string | null,
    initialData?: NodeCreationData
  ) => {
    const { nodes, edges, _pushHistory, syncDownstream } = get()
    const sourceNode = nodes.find((node) => node.id === sourceNodeId)
    if (!sourceNode) return

    const newNode = {
      id: uuidv4(),
      type,
      position,
      data: createNodeData(type, initialData),
    } as AppNode
    const nextNodes = [...nodes, newNode]
    const connection: Connection = {
      source: sourceNodeId,
      target: newNode.id,
      sourceHandle: sourceHandle ?? null,
      targetHandle: null,
    }

    if (!isValidConnection(connection, nextNodes, edges)) {
      console.warn('[flow] rejected quick-create connection')
      return
    }

    _pushHistory()
    const nextEdges = addEdge({ ...connection, type: 'smoothstep', animated: false }, edges)
    set({
      nodes: nextNodes,
      edges: nextEdges,
    })

    setTimeout(() => syncDownstream(sourceNodeId), 0)
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

        if (node.type === 'threeViewGen') {
          return {
            ...node,
            data: syncThreeViewGenDerivedState(mergedData as Partial<ThreeViewGenNodeData>),
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

        if (node.type === 'continuity') {
          return {
            ...node,
            data: syncContinuityDerivedState(mergedData as Partial<ContinuityNodeData>),
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
    const affectedTargetIds = get().edges
      .filter((edge) => edge.source === nodeId)
      .map((edge) => edge.target)

    set({
      nodes: get().nodes.filter((node) => node.id !== nodeId),
      edges: get().edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    })

    if (affectedTargetIds.length > 0) {
      setTimeout(() => {
        const { nodes, edges, getUpstreamImages, getUpstreamVideos } = get()

        affectedTargetIds.forEach((targetNodeId) => {
          const targetNode = nodes.find((node) => node.id === targetNodeId)
          if (!targetNode) return

          if (targetNode.type === 'imageGen') {
            get().updateNodeData(targetNodeId, { upstreamReferenceImages: getUpstreamImages(targetNodeId) })
            return
          }

          if (targetNode.type === 'threeViewGen') {
            get().updateNodeData(targetNodeId, { referenceImages: getUpstreamImages(targetNodeId) })
            return
          }

          if (targetNode.type === 'videoGen') {
            get().updateNodeData(targetNodeId, { sourceImages: getUpstreamImages(targetNodeId) })
            return
          }

          if (targetNode.type === 'character') {
            get().updateNodeData(targetNodeId, getCharacterInputSyncData(targetNodeId, nodes, edges))
            return
          }

          if (targetNode.type === 'continuity') {
            const continuityContext = getContinuityContext(targetNodeId, nodes, edges)
            get().updateNodeData(targetNodeId, {
              contextSignature: continuityContext.contextSignature,
            })
            return
          }

          if (targetNode.type === 'shot') {
            const shotContext = getShotContext(targetNodeId, nodes, edges)
            get().updateNodeData(targetNodeId, {
              referenceImages: shotContext.referenceImages,
              contextSignature: shotContext.contextSignature,
            })
            return
          }

          if (targetNode.type === 'imageDisplay') {
            get().updateNodeData(targetNodeId, { images: getUpstreamImages(targetNodeId) })
            return
          }

          if (targetNode.type === 'videoDisplay') {
            get().updateNodeData(targetNodeId, { videos: getUpstreamVideos(targetNodeId) })
          }
        })
      }, 0)
    }
  },

  deleteEdge: (edgeId: string) => {
    const currentEdges = get().edges
    const targetEdge = currentEdges.find((edge) => edge.id === edgeId)
    if (!targetEdge) return

    get()._pushHistory()
    set({
      edges: currentEdges.filter((edge) => edge.id !== edgeId),
    })

    setTimeout(() => {
      const { nodes, edges, getUpstreamImages, getUpstreamVideos } = get()
      const targetNode = nodes.find((node) => node.id === targetEdge.target)
      if (!targetNode) return

      if (targetNode.type === 'imageGen') {
        get().updateNodeData(targetEdge.target, { upstreamReferenceImages: getUpstreamImages(targetEdge.target) })
        return
      }

      if (targetNode.type === 'threeViewGen') {
        get().updateNodeData(targetEdge.target, { referenceImages: getUpstreamImages(targetEdge.target) })
        return
      }

      if (targetNode.type === 'videoGen') {
        get().updateNodeData(targetEdge.target, { sourceImages: getUpstreamImages(targetEdge.target) })
        return
      }

      if (targetNode.type === 'character') {
        get().updateNodeData(targetEdge.target, getCharacterInputSyncData(targetEdge.target, nodes, edges))
        return
      }

      if (targetNode.type === 'continuity') {
        const continuityContext = getContinuityContext(targetEdge.target, nodes, edges)
        get().updateNodeData(targetEdge.target, {
          contextSignature: continuityContext.contextSignature,
        })
        return
      }

      if (targetNode.type === 'shot') {
        const shotContext = getShotContext(targetEdge.target, nodes, edges)
        get().updateNodeData(targetEdge.target, {
          referenceImages: shotContext.referenceImages,
          contextSignature: shotContext.contextSignature,
        })
        return
      }

      if (targetNode.type === 'imageDisplay') {
        get().updateNodeData(targetEdge.target, { images: getUpstreamImages(targetEdge.target) })
        return
      }

      if (targetNode.type === 'videoDisplay') {
        get().updateNodeData(targetEdge.target, { videos: getUpstreamVideos(targetEdge.target) })
      }
    }, 0)
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
      images.push(...getSourceNodeOutputImages(sourceNode, edge.sourceHandle))
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

      if (targetNode.type === 'threeViewGen') {
        updateNodeData(edge.target, { referenceImages: getUpstreamImages(edge.target) })
        continue
      }

      if (targetNode.type === 'videoGen') {
        updateNodeData(edge.target, { sourceImages: getUpstreamImages(edge.target) })
        continue
      }

      if (targetNode.type === 'character') {
        updateNodeData(edge.target, getCharacterInputSyncData(edge.target, nodes, edges))
        continue
      }

      if (targetNode.type === 'continuity') {
        const continuityContext = getContinuityContext(edge.target, nodes, edges)
        updateNodeData(edge.target, {
          contextSignature: continuityContext.contextSignature,
        })
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

  selectNode: (nodeId: string | null) => {
    set({
      nodes: get().nodes.map(
        (node) =>
          ({
            ...node,
            selected: nodeId ? node.id === nodeId : false,
          }) as AppNode
      ),
      edges: get().edges.map((edge) => ({ ...edge, selected: false } as AppEdge)),
    })
  },

  selectEdge: (edgeId: string | null) => {
    set({
      nodes: get().nodes.map((node) => ({ ...node, selected: false } as AppNode)),
      edges: get().edges.map(
        (edge) =>
          ({
            ...edge,
            selected: edgeId ? edge.id === edgeId : false,
          }) as AppEdge
      ),
    })
  },

  clearSelection: () => {
    set({
      nodes: get().nodes.map((node) => ({ ...node, selected: false } as AppNode)),
      edges: get().edges.map((edge) => ({ ...edge, selected: false } as AppEdge)),
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

      if (node.type === 'threeViewGen') {
        return {
          ...node,
          selected: false,
          data: syncThreeViewGenDerivedState(node.data as Partial<ThreeViewGenNodeData>),
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

      if (node.type === 'continuity') {
        return {
          ...node,
          selected: false,
          data: syncContinuityDerivedState(node.data as Partial<ContinuityNodeData>),
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
    const characterSyncedNodes = initialNormalizedNodes.map((node) => {
      if (node.type === 'character') {
        return {
          ...node,
          data: normalizeCharacterData({
            ...(node.data as CharacterNodeData),
            ...getCharacterInputSyncData(node.id, initialNormalizedNodes, normalizedEdges),
          }),
        } as AppNode
      }

      return node
    })

    const normalizedNodes = characterSyncedNodes.map((node) => {
      if (node.type === 'character') {
        return node
      }

      if (node.type === 'continuity') {
        const continuityContext = getContinuityContext(node.id, characterSyncedNodes, normalizedEdges)
        return {
          ...node,
          data: syncContinuityDerivedState({
            ...(node.data as ContinuityNodeData),
            contextSignature: continuityContext.contextSignature,
          }),
        } as AppNode
      }

      if (node.type === 'shot') {
        const shotContext = getShotContext(node.id, characterSyncedNodes, normalizedEdges)
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
