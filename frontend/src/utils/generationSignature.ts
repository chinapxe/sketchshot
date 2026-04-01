import type { ImageGenNodeData, VideoGenNodeData } from '../types'

type ImageSignatureSource = Pick<
  ImageGenNodeData,
  'prompt' | 'aspectRatio' | 'resolution' | 'adapter' | 'referenceImages' | 'identityLock' | 'identityStrength'
>

type VideoSignatureSource = Pick<
  VideoGenNodeData,
  'prompt' | 'aspectRatio' | 'durationSeconds' | 'motionStrength' | 'adapter' | 'sourceImages'
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
    identityLock: data.identityLock ?? false,
    identityStrength: data.identityStrength ?? 0.7,
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
