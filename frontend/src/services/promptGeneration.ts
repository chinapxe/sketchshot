import {
  generateContinuityFrames,
  generatePrompt,
  type PromptGenerateRequest,
} from './api'
import type { ContinuityNodeData, ImageGenNodeData, ShotNodeData, VideoGenNodeData } from '../types'
import { CAMERA_ANGLE_OPTIONS, SHOT_SIZE_OPTIONS, getOptionLabel } from '../config/storyboardPresets'
import { buildCharacterConsistencyRequirement } from '../utils/characterConsistency'
import type { ContinuityContext, ShotContext } from '../utils/storyboard'
import { buildShotPrompt } from '../utils/storyboard'

function inferPromptLanguage(value: string): 'zh' | 'en' {
  return /[\u4e00-\u9fff]/.test(value) ? 'zh' : 'en'
}

function compactRequirements(values: Array<string | false | null | undefined>): string[] {
  return values
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())
}

function joinNonEmpty(parts: Array<string | false | null | undefined>, separator = '；'): string {
  return parts
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim())
    .join(separator)
}

function summarizeContinuityContext(context: ContinuityContext): string[] {
  const sections: string[] = []

  if (context.scenes.length > 0) {
    sections.push(
      `场次设定：${context.scenes
        .map((scene) => joinNonEmpty([scene.title, scene.synopsis, scene.beat]))
        .filter((value) => value.length > 0)
        .join(' | ')}`
    )
  }

  if (context.characters.length > 0) {
    sections.push(
      `角色设定：${context.characters
        .map((character) =>
          joinNonEmpty([
            character.name,
            character.role,
            character.appearance,
            character.temperamentTags.length > 0 ? `气质：${character.temperamentTags.join('、')}` : '',
            character.stateTags.length > 0 ? `状态：${character.stateTags.join('、')}` : '',
            character.wardrobe,
            character.props,
            character.notes,
          ])
        )
        .filter((value) => value.length > 0)
        .join(' | ')}`
    )
  }

  if (context.styles.length > 0) {
    sections.push(
      `风格设定：${context.styles
        .map((style) =>
          joinNonEmpty([
            style.name,
            style.keywords,
            style.palette,
            style.lighting,
            style.framing,
            style.styleTags.length > 0 ? `风格标签：${style.styleTags.join('、')}` : '',
            style.paletteTags.length > 0 ? `色彩标签：${style.paletteTags.join('、')}` : '',
            style.lightingTags.length > 0 ? `光线标签：${style.lightingTags.join('、')}` : '',
            style.framingTags.length > 0 ? `构图标签：${style.framingTags.join('、')}` : '',
            style.qualityTags.length > 0 ? `质感标签：${style.qualityTags.join('、')}` : '',
            style.notes,
          ])
        )
        .filter((value) => value.length > 0)
        .join(' | ')}`
    )
  }

  if (context.referenceAssets.length > 0) {
    sections.push(
      `参考图线索：${context.referenceAssets
        .map((asset) => `${asset.title}（${asset.relation}）`)
        .join('、')}`
    )
  }

  return sections
}

function buildContinuityBrief(data: ContinuityNodeData): string {
  return data.prompt.trim() || '为一个九宫格连续分镜编写总提示词，突出主体、场景、动作推进、镜头节奏和视觉一致性。'
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

export function buildContinuityPromptRequest(
  data: ContinuityNodeData,
  context: ContinuityContext
): PromptGenerateRequest {
  const baseIdea = buildContinuityBrief(data)
  const styleSummary = context.styles.map((style) => style.name).filter((value) => value.length > 0).join(' / ')

  return {
    task_type: 'general',
    user_input: baseIdea,
    style: styleSummary || 'nine-panel storyboard prompt',
    aspect_ratio: '',
    extra_requirements: compactRequirements([
      'Return one polished master prompt for a nine-panel storyboard or 3x3 continuity grid.',
      'The 9 panels must stay visually consistent while showing clear progressive action.',
      context.referenceAssets.length > 0
        ? `Connected reference assets: ${context.referenceAssets.map((asset) => `${asset.title} (${asset.relation})`).join(', ')}`
        : null,
      ...summarizeContinuityContext(context),
      context.referenceImages.length > 0 ? `Reference images available: ${context.referenceImages.length}` : null,
    ]),
    reference_images: context.referenceImages,
    language: inferPromptLanguage(baseIdea),
  }
}

export function buildContinuityFramesRequest(
  data: ContinuityNodeData,
  context: ContinuityContext
): { user_input: string; reference_images: string[]; language: 'zh' | 'en' } {
  const sections = [`九宫格总提示词：${buildContinuityBrief(data)}`, ...summarizeContinuityContext(context)]
  const promptLanguage = inferPromptLanguage(sections.join('\n'))

  return {
    user_input: sections.join('\n'),
    reference_images: context.referenceImages,
    language: promptLanguage,
  }
}

export function buildContinuityPreviewPrompt(
  data: ContinuityNodeData,
  context: ContinuityContext
): string {
  const filledFrames = (data.frames ?? [])
    .map((frame, index) => ({
      index,
      text: frame.trim(),
    }))
    .filter((frame) => frame.text.length > 0)

  const sections = [
    '生成一张完整的九宫格分镜预览图。',
    '要求画面为单张 3x3 九宫格拼图，按从左到右、从上到下排列 1 到 9 格。',
    '九格中的主体、服装、身份、场景和整体风格必须保持一致，但动作与镜头节奏要连续推进。',
    '每一格都要明显不同，形成清晰的动作递进、视线变化和情绪推进。',
    '画面应具备故事板/分镜板质感，禁止额外面板、字幕、水印、页码和说明文字。',
    data.prompt.trim() ? `九宫格总提示词：${data.prompt.trim()}` : '',
    filledFrames.length > 0
      ? `九格动作拆解：${filledFrames.map((frame) => `${frame.index + 1}. ${frame.text}`).join(' | ')}`
      : '',
    ...summarizeContinuityContext(context),
  ]

  return sections.filter((section) => section.length > 0).join('\n')
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

export async function generateContinuityPrompt(
  data: ContinuityNodeData,
  context: ContinuityContext
): Promise<string> {
  const response = await generatePrompt(buildContinuityPromptRequest(data, context))
  return response.prompt
}

export async function generateContinuityFrameList(
  data: ContinuityNodeData,
  context: ContinuityContext
): Promise<string[]> {
  const response = await generateContinuityFrames(buildContinuityFramesRequest(data, context))
  return response.frames
}
