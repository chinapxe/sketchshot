import type { ImageGenNodeData, ShotNodeData, VideoGenNodeData } from '../types'

type ImageSignatureSource = Pick<
  ImageGenNodeData,
  'prompt' | 'aspectRatio' | 'resolution' | 'adapter' | 'referenceImages'
>

type VideoSignatureSource = Pick<
  VideoGenNodeData,
  'prompt' | 'aspectRatio' | 'durationSeconds' | 'motionStrength' | 'adapter' | 'sourceImages'
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

function normalizeAssetList(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).filter((value) => value.length > 0)))
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
    adapter: data.adapter,
    sourceImages: normalizeAssetList(data.sourceImages),
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
    motion: data.motion.trim(),
    emotion: data.emotion.trim(),
    aspectRatio: data.aspectRatio,
    resolution: data.resolution,
    imageAdapter: data.imageAdapter ?? 'auto',
    videoAdapter: data.videoAdapter ?? 'volcengine',
    durationSeconds: data.durationSeconds,
    motionStrength: data.motionStrength,
    referenceImages: normalizeAssetList(data.referenceImages),
    contextSignature: data.contextSignature ?? '',
  })
}
