import { generatePrompt, type PromptGenerateRequest } from './api'
import type { ImageGenNodeData, VideoGenNodeData } from '../types'

function inferPromptLanguage(value: string): 'zh' | 'en' {
  return /[\u4e00-\u9fff]/.test(value) ? 'zh' : 'en'
}

function compactRequirements(values: Array<string | false | null | undefined>): string[] {
  return values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
}

export function buildImagePromptRequest(data: ImageGenNodeData): PromptGenerateRequest {
  const baseIdea = data.prompt.trim()
    || (data.referenceImages.length > 0
      ? 'Create a cinematic image-generation prompt based on the connected reference images.'
      : 'Create a high-quality cinematic image-generation prompt with strong visual detail.')

  return {
    task_type: 'image',
    user_input: baseIdea,
    style: data.referenceImages.length > 0 ? 'reference-guided cinematic image' : 'cinematic image',
    aspect_ratio: data.aspectRatio,
    extra_requirements: compactRequirements([
      `Target resolution: ${data.resolution}`,
      data.referenceImages.length > 0 ? `Reference images available: ${data.referenceImages.length}` : null,
      data.identityLock ? `Preserve character identity with strength ${data.identityStrength}` : null,
    ]),
    language: inferPromptLanguage(baseIdea),
  }
}

export function buildVideoPromptRequest(data: VideoGenNodeData): PromptGenerateRequest {
  const baseIdea = data.prompt.trim()
    || (data.sourceImages.length > 0
      ? 'Create an image-to-video motion prompt based on the connected key frames, emphasizing camera movement and subject motion.'
      : 'Create a high-quality cinematic motion prompt for image-to-video generation.')

  return {
    task_type: 'video',
    user_input: baseIdea,
    style: 'cinematic motion prompt',
    aspect_ratio: data.aspectRatio,
    extra_requirements: compactRequirements([
      `Target duration: ${data.durationSeconds}s`,
      `Motion strength: ${Math.round(data.motionStrength * 100)}%`,
      data.sourceImages.length > 0 ? `Source images available: ${data.sourceImages.length}` : null,
    ]),
    language: inferPromptLanguage(baseIdea),
  }
}

export async function generateImagePrompt(data: ImageGenNodeData): Promise<string> {
  const response = await generatePrompt(buildImagePromptRequest(data))
  return response.prompt
}

export async function generateVideoPrompt(data: VideoGenNodeData): Promise<string> {
  const response = await generatePrompt(buildVideoPromptRequest(data))
  return response.prompt
}
