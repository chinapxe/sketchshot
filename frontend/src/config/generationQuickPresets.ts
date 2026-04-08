import type { ImageGenNodeData, VideoGenNodeData } from '../types'

export interface ImageQuickTemplate {
  id: string
  label: string
  hint: string
  prompt: string
  aspectRatio?: ImageGenNodeData['aspectRatio']
  resolution?: ImageGenNodeData['resolution']
}

export interface VideoQuickTemplate {
  id: string
  label: string
  hint: string
  prompt: string
  aspectRatio?: VideoGenNodeData['aspectRatio']
  durationSeconds?: VideoGenNodeData['durationSeconds']
  motionStrength?: VideoGenNodeData['motionStrength']
}

export interface QuickPromptChip {
  id: string
  label: string
  prompt: string
}

export const IMAGE_QUICK_TEMPLATES: ImageQuickTemplate[] = [
  {
    id: 'emotional-close-up',
    label: '情绪特写',
    hint: '先抓表情和气氛',
    prompt: '电影感情绪特写，主体面部表情清晰，浅景深，情绪张力强，细节丰富',
    aspectRatio: '3:4',
    resolution: '2K',
  },
  {
    id: 'narrative-medium',
    label: '叙事中景',
    hint: '人物和环境都交代',
    prompt: '叙事中景，主体与环境关系清晰，动作自然，构图稳定，电影感光影',
    aspectRatio: '16:9',
    resolution: '2K',
  },
  {
    id: 'epic-wide',
    label: '史诗大景',
    hint: '先搭空间和气势',
    prompt: '史诗级大场景，全景构图，空间纵深明显，光影层次丰富，氛围宏大',
    aspectRatio: '16:9',
    resolution: '4K',
  },
]

export const IMAGE_QUICK_PROMPT_CHIPS: QuickPromptChip[] = [
  { id: 'centered', label: '中心构图', prompt: '中心构图' },
  { id: 'rule-of-thirds', label: '三分构图', prompt: '三分构图' },
  { id: 'negative-space', label: '留白构图', prompt: '留白构图' },
  { id: 'soft-light', label: '柔和光线', prompt: '柔和光线' },
  { id: 'film-grain', label: '电影颗粒', prompt: '电影颗粒' },
]

export const VIDEO_QUICK_TEMPLATES: VideoQuickTemplate[] = [
  {
    id: 'steady-shot',
    label: '稳定镜头',
    hint: '克制、平稳、好起步',
    prompt: '稳定镜头，主体动作清晰，画面平稳自然，节奏克制',
    aspectRatio: '16:9',
    durationSeconds: 4,
    motionStrength: 0.35,
  },
  {
    id: 'cinematic-push',
    label: '电影推镜',
    hint: '情绪逐步压近',
    prompt: '电影感缓慢推镜，镜头稳定靠近主体，情绪逐步加强，运动自然连贯',
    aspectRatio: '16:9',
    durationSeconds: 4,
    motionStrength: 0.55,
  },
  {
    id: 'tense-handheld',
    label: '紧张手持',
    hint: '压迫感更强',
    prompt: '紧张手持镜头，轻微抖动，贴近主体，节奏压迫，临场感明显',
    aspectRatio: '9:16',
    durationSeconds: 4,
    motionStrength: 0.75,
  },
]

export const VIDEO_MOTION_PROMPT_CHIPS: QuickPromptChip[] = [
  { id: 'static', label: '固定镜头', prompt: '固定镜头' },
  { id: 'push-in', label: '推镜', prompt: '缓慢推镜' },
  { id: 'pull-out', label: '拉镜', prompt: '缓慢拉镜' },
  { id: 'tracking', label: '跟镜', prompt: '跟随主体运动' },
  { id: 'orbit', label: '环绕', prompt: '环绕主体运动' },
  { id: 'handheld', label: '手持', prompt: '手持镜头质感' },
  { id: 'micro-shake', label: '轻微抖动', prompt: '轻微抖动' },
]

export function appendPromptLine(currentPrompt: string, line: string): string {
  const nextLine = line.trim()
  const normalizedPrompt = currentPrompt.trim()

  if (nextLine.length === 0) return normalizedPrompt
  if (normalizedPrompt.length === 0) return nextLine
  if (normalizedPrompt.includes(nextLine)) return normalizedPrompt

  return `${normalizedPrompt}\n${nextLine}`
}

export function appendPromptFragment(currentPrompt: string, fragment: string): string {
  const nextFragment = fragment.trim()
  const normalizedPrompt = currentPrompt.trim()

  if (nextFragment.length === 0) return normalizedPrompt
  if (normalizedPrompt.length === 0) return nextFragment
  if (normalizedPrompt.includes(nextFragment)) return normalizedPrompt

  return `${normalizedPrompt}，${nextFragment}`
}
