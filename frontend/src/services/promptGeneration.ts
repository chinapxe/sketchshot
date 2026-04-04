import { generatePrompt, type PromptGenerateRequest } from './api'
import type { ImageGenNodeData, ShotNodeData, VideoGenNodeData } from '../types'
import { CAMERA_ANGLE_OPTIONS, SHOT_SIZE_OPTIONS, getOptionLabel } from '../config/storyboardPresets'
import { buildCharacterConsistencyRequirement } from '../utils/characterConsistency'
import type { ShotContext } from '../utils/storyboard'
import { buildShotPrompt } from '../utils/storyboard'

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
      buildCharacterConsistencyRequirement(data.referenceImages),
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

export function buildShotPromptRequest(data: ShotNodeData, context: ShotContext): PromptGenerateRequest {
  const baseIdea = buildShotPrompt(data, context).trim()
    || (data.outputType === 'video'
      ? 'Create a cinematic image-to-video shot prompt with clear subject motion and camera movement.'
      : 'Create a cinematic storyboard shot prompt with strong visual detail and clear framing.')

  const styleSummary = context.styles.map((style) => style.name).filter((value) => value.length > 0).join(' / ')

  return {
    task_type: data.outputType === 'video' ? 'video' : 'image',
    user_input: baseIdea,
    style: styleSummary || 'storyboard cinematic shot',
    aspect_ratio: data.aspectRatio,
    extra_requirements: compactRequirements([
      `Shot size: ${data.shotSize === 'establishing' ? '大全景' : getOptionLabel(SHOT_SIZE_OPTIONS, data.shotSize)}`,
      `Camera angle: ${getOptionLabel(CAMERA_ANGLE_OPTIONS, data.cameraAngle)}`,
      data.cameraMovement?.trim() ? `Camera movement: ${data.cameraMovement.trim()}` : null,
      data.composition?.trim() ? `Composition: ${data.composition.trim()}` : null,
      data.lightingStyle?.trim() ? `Lighting style: ${data.lightingStyle.trim()}` : null,
      data.moodTags && data.moodTags.length > 0 ? `Mood tags: ${data.moodTags.join(', ')}` : null,
      data.qualityTags && data.qualityTags.length > 0 ? `Quality tags: ${data.qualityTags.join(', ')}` : null,
      data.outputType === 'image' ? `Target resolution: ${data.resolution}` : null,
      data.outputType === 'video' ? `Target duration: ${data.durationSeconds}s` : null,
      data.outputType === 'video' ? `Motion strength: ${Math.round(data.motionStrength * 100)}%` : null,
      data.outputType === 'video' && data.videoFirstFrame ? 'First frame locked' : null,
      data.outputType === 'video' && data.videoLastFrame ? 'Last frame locked' : null,
      context.previousShots.length > 0 ? `Upstream shots attached: ${context.previousShots.length}` : null,
      context.characters.length > 0 ? `Characters attached: ${context.characters.length}` : null,
      context.styles.length > 0 ? `Styles attached: ${context.styles.length}` : null,
      context.referenceImages.length > 0 ? `Reference images available: ${context.referenceImages.length}` : null,
      data.outputType === 'image' ? buildCharacterConsistencyRequirement(context.referenceImages) : null,
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

export async function generateShotPrompt(data: ShotNodeData, context: ShotContext): Promise<string> {
  const response = await generatePrompt(buildShotPromptRequest(data, context))
  return response.prompt
}
