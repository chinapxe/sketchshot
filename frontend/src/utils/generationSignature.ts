import type {
  ContinuityNodeData,
  ImageGenNodeData,
  ImageUpscaleNodeData,
  ShotNodeData,
  ThreeViewGenNodeData,
  VideoEditNodeData,
  VideoGenNodeData,
} from '../types'

type ImageSignatureSource = Pick<
  ImageGenNodeData,
  'prompt' | 'aspectRatio' | 'resolution' | 'adapter' | 'referenceImages' | 'nonRealisticStyle' | 'negativePrompt'
>

type VideoSignatureSource = Pick<
  VideoGenNodeData,
  | 'prompt'
  | 'aspectRatio'
  | 'durationSeconds'
  | 'motionStrength'
  | 'adapter'
  | 'sourceImages'
  | 'seedanceVersion'
  | 'referenceVideos'
  | 'referenceAudios'
  | 'multiImageRole'
  | 'generateAudio'
  | 'videoResolution'
  | 'negativePrompt'
  | 'seed'
  | 'cameraFixed'
  | 'videoModelTier'
  | 'returnLastFrame'
  | 'nonRealisticStyle'
>

type ThreeViewSignatureSource = Pick<
  ThreeViewGenNodeData,
  'prompt' | 'aspectRatio' | 'resolution' | 'adapter' | 'referenceImages' | 'outputMode'
>

type ShotSignatureSource = Pick<
  ShotNodeData,
  | 'prompt'
  | 'title'
  | 'description'
  | 'continuityFrames'
  | 'videoFirstFrame'
  | 'videoLastFrame'
  | 'shotSize'
  | 'cameraAngle'
  | 'cameraMovement'
  | 'composition'
  | 'lightingStyle'
  | 'moodTags'
  | 'qualityTags'
  | 'motion'
  | 'emotion'
  | 'aspectRatio'
  | 'resolution'
  | 'outputType'
  | 'imageAdapter'
  | 'videoAdapter'
  | 'durationSeconds'
  | 'motionStrength'
  | 'referenceImages'
  | 'contextSignature'
>

type ContinuitySignatureSource = Pick<
  ContinuityNodeData,
  'prompt' | 'frames' | 'aspectRatio' | 'resolution' | 'adapter' | 'contextSignature'
>

function normalizeAssetList(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).filter((value) => value.length > 0)))
}

function normalizeTagList(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter((value) => value.length > 0)))
}

/**
 * Build a stable signature for image generation inputs.
 */
export function buildGenerationSignature(data: ImageSignatureSource): string {
  return JSON.stringify({
    prompt: data.prompt.trim(),
    aspectRatio: data.aspectRatio,
    resolution: data.resolution,
    adapter: data.adapter ?? 'auto',
    referenceImages: normalizeAssetList(data.referenceImages),
    nonRealisticStyle: data.nonRealisticStyle ?? false,
    negativePrompt: (data.negativePrompt || '').trim(),
  })
}

/**
 * Build a stable signature for video generation inputs.
 */
export function buildVideoGenerationSignature(data: VideoSignatureSource): string {
  return JSON.stringify({
    prompt: data.prompt.trim(),
    aspectRatio: data.aspectRatio,
    durationSeconds: data.durationSeconds,
    motionStrength: data.motionStrength,
    adapter: data.adapter ?? 'auto',
    sourceImages: normalizeAssetList(data.sourceImages),
    seedanceVersion: data.seedanceVersion ?? '1.5',
    referenceVideos: normalizeAssetList(data.referenceVideos),
    referenceAudios: normalizeAssetList(data.referenceAudios),
    multiImageRole: data.multiImageRole ?? 'transition',
    generateAudio: data.generateAudio,
    videoResolution: data.videoResolution,
    negativePrompt: data.negativePrompt,
    seed: data.seed ?? -1,
    cameraFixed: data.cameraFixed,
    videoModelTier: data.videoModelTier,
    returnLastFrame: data.returnLastFrame,
    nonRealisticStyle: data.nonRealisticStyle ?? false,
  })
}

/**
 * Build a stable signature for three-view sheet generation inputs.
 */
export function buildThreeViewGenerationSignature(data: ThreeViewSignatureSource): string {
  return JSON.stringify({
    prompt: data.prompt.trim(),
    aspectRatio: data.aspectRatio,
    resolution: data.resolution,
    adapter: data.adapter ?? 'auto',
    referenceImages: normalizeAssetList(data.referenceImages),
    outputMode: data.outputMode ?? 'sheet',
  })
}

/**
 * Build a stable signature for storyboard shot generation inputs.
 */
export function buildShotGenerationSignature(data: ShotSignatureSource): string {
  const continuityFrames =
    data.outputType === 'video'
      ? (data.continuityFrames ?? [])
          .map((frame) => frame.trim())
          .filter((frame) => frame.length > 0)
      : []
  const videoFirstFrame = data.outputType === 'video' ? data.videoFirstFrame ?? '' : ''
  const videoLastFrame = data.outputType === 'video' ? data.videoLastFrame ?? '' : ''

  return JSON.stringify({
    outputType: data.outputType,
    title: data.title.trim(),
    description: data.description.trim(),
    prompt: data.prompt.trim(),
    continuityFrames,
    videoFirstFrame,
    videoLastFrame,
    shotSize: data.shotSize,
    cameraAngle: data.cameraAngle,
    cameraMovement: data.cameraMovement?.trim() ?? '',
    composition: data.composition?.trim() ?? '',
    lightingStyle: data.lightingStyle?.trim() ?? '',
    moodTags: normalizeTagList(data.moodTags),
    qualityTags: normalizeTagList(data.qualityTags),
    motion: data.motion.trim(),
    emotion: data.emotion.trim(),
    aspectRatio: data.aspectRatio,
    resolution: data.resolution,
    imageAdapter: data.imageAdapter ?? 'auto',
    videoAdapter: data.videoAdapter ?? 'auto',
    durationSeconds: data.durationSeconds,
    motionStrength: data.motionStrength,
    referenceImages: normalizeAssetList(data.referenceImages),
    contextSignature: data.contextSignature ?? '',
  })
}

/**
 * Build a stable signature for nine-panel continuity preview generation inputs.
 */
export function buildContinuityGenerationSignature(data: ContinuitySignatureSource): string {
  return JSON.stringify({
    prompt: data.prompt.trim(),
    frames: (data.frames ?? []).map((frame) => frame.trim()),
    aspectRatio: data.aspectRatio ?? '1:1',
    resolution: data.resolution ?? '2K',
    adapter: data.adapter ?? 'auto',
    contextSignature: data.contextSignature ?? '',
  })
}

type UpscaleSignatureSource = Pick<
  ImageUpscaleNodeData,
  'prompt' | 'targetResolution' | 'sourceImage'
>

export function buildUpscaleGenerationSignature(data: UpscaleSignatureSource): string {
  return JSON.stringify({
    prompt: data.prompt.trim(),
    targetResolution: data.targetResolution,
    sourceImage: data.sourceImage ?? '',
  })
}

type VideoEditSignatureSource = Pick<
  VideoEditNodeData,
  | 'prompt'
  | 'sourceVideo'
  | 'referenceImages'
  | 'seedanceVersion'
  | 'resolution'
  | 'veditModel'
  | 'generateAudio'
  | 'videoResolution'
  | 'negativePrompt'
  | 'seed'
  | 'cameraFixed'
  | 'returnLastFrame'
  | 'durationSeconds'
>

/**
 * Build a stable signature for video edit generation inputs.
 */
export function buildVideoEditGenerationSignature(data: VideoEditSignatureSource): string {
  return JSON.stringify({
    prompt: data.prompt.trim(),
    sourceVideo: data.sourceVideo ?? '',
    referenceImages: normalizeAssetList(data.referenceImages),
    seedanceVersion: data.seedanceVersion ?? '1.5',
    resolution: data.resolution,
    veditModel: data.veditModel ?? '',
    generateAudio: data.generateAudio,
    videoResolution: data.videoResolution,
    negativePrompt: data.negativePrompt,
    seed: data.seed ?? -1,
    cameraFixed: data.cameraFixed,
    returnLastFrame: data.returnLastFrame,
    durationSeconds: data.durationSeconds,
  })
}
