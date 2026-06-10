/**
 * Canvas node and edge type definitions.
 */
import type { Edge, Node } from '@xyflow/react'

export const NodeStatus = {
  IDLE: 'idle',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  ERROR: 'error',
} as const

export type NodeStatus = (typeof NodeStatus)[keyof typeof NodeStatus]
export type ImageGenAdapter = 'auto' | 'mock' | 'comfyui' | 'volcengine' | 'wanx'
export type VideoGenAdapter = 'auto' | 'mock' | 'volcengine' | 'wanx' | 'happyhorse'
export type ThreeViewOutputMode = 'sheet' | 'split'
export type ShotOutputType = 'image' | 'video'
export type ShotSize =
  | 'extreme-close-up'
  | 'close-up'
  | 'medium-close-up'
  | 'medium'
  | 'medium-wide'
  | 'wide'
  | 'extreme-wide'
  | 'establishing'
export type CameraAngle = 'eye-level' | 'low-angle' | 'high-angle' | 'over-shoulder' | 'top-down'

export interface CharacterThreeViewImages {
  front?: string
  side?: string
  back?: string
}

export interface ImageUploadNodeData {
  label: string
  imageUrl?: string
  fileName?: string
  isUploading?: boolean
  uploadError?: string
  [key: string]: unknown
}

export interface ImageGenNodeData {
  label: string
  prompt: string
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  resolution: '1K' | '2K' | '4K'
  adapter: ImageGenAdapter
  upstreamReferenceImages?: string[]
  manualReferenceImages?: string[]
  referenceImages: string[]
  isUploadingReferences?: boolean
  referenceUploadError?: string
  identityLock: boolean
  identityStrength: number
  /** Inject non-realistic style keywords to comply with content policy */
  nonRealisticStyle?: boolean
  /** Negative prompt for quality control (passed to Seedream) */
  negativePrompt?: string
  status: NodeStatus
  progress: number
  creditCost: number
  outputImage?: string
  outputImageOriginalUrl?: string
  lastRunSignature?: string
  resultCache?: Record<string, string>
  needsRefresh?: boolean
  errorMessage?: string
  [key: string]: unknown
}

export interface ThreeViewGenNodeData {
  label: string
  prompt: string
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  resolution: '1K' | '2K' | '4K'
  adapter: ImageGenAdapter
  referenceImages: string[]
  outputMode?: ThreeViewOutputMode
  status: NodeStatus
  progress: number
  creditCost: number
  outputImage?: string
  outputImages?: CharacterThreeViewImages
  lastRunSignature?: string
  resultCache?: Record<string, string>
  splitResultCache?: Record<string, CharacterThreeViewImages>
  needsRefresh?: boolean
  errorMessage?: string
  [key: string]: unknown
}

export interface ImageDisplayNodeData {
  label: string
  images: string[]
  status: NodeStatus
  [key: string]: unknown
}

export interface VideoGenNodeData {
  label: string
  prompt: string
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  durationSeconds: number
  motionStrength: number
  adapter: VideoGenAdapter
  sourceImages: string[]
  /** HappyHorse specific: "t2v" | "i2v" | "r2v" */
  happyhorseMode?: string
  /** HappyHorse specific: native audio-video joint generation with auto lip-sync */
  happyhorseWithAudio?: boolean
  /** HappyHorse specific: quality mode 'pro' (quality) / 'std' (speed) */
  happyhorseQualityMode?: 'pro' | 'std'
  /** Per-node Seedance version override: "1.5" | "2.0" */
  seedanceVersion?: '1.5' | '2.0'
  /** Seedance 2.0 only: generate synchronized audio */
  generateAudio?: boolean
  /** Seedance 2.0 only: 480p | 720p | 1080p */
  videoResolution?: '480p' | '720p' | '1080p'
  /** Seedance 2.0 only: negative prompt */
  negativePrompt?: string
  /** Seedance 2.0 only: random seed (-1 = random) */
  seed?: number
  /** Seedance 2.0 only: lock camera (no auto camera moves) */
  cameraFixed?: boolean
  /** Seedance 2.0 only: standard | fast */
  videoModelTier?: 'standard' | 'fast'
  /** Seedance 2.0 only: also return last frame image (for chaining clips) */
  returnLastFrame?: boolean
  /** Seedance 2.0 only: URL of the last frame image (set on success when returnLastFrame=true) */
  outputLastFrame?: string
  /** Seedance 2.0 only: reference video URLs gathered from upstream (max 1) */
  referenceVideos?: string[]
  /** Seedance 2.0 only: reference audio URLs gathered from upstream (max 1) */
  referenceAudios?: string[]
  /** Seedance 2.0 only: how to use ≥2 source images. 'transition' = first/last frame; 'reference' = all as reference_image */
  multiImageRole?: 'transition' | 'reference'
  /** Inject non-realistic style keywords to comply with content policy */
  nonRealisticStyle?: boolean
  status: NodeStatus
  progress: number
  creditCost: number
  outputVideo?: string
  lastRunSignature?: string
  resultCache?: Record<string, string>
  needsRefresh?: boolean
  errorMessage?: string
  [key: string]: unknown
}

export interface VideoUploadNodeData {
  label: string
  /** Uploaded video URL */
  videoUrl?: string
  fileName?: string
  isUploading?: boolean
  uploadError?: string
  [key: string]: unknown
}

export interface AnimateMixNodeData {
  label: string
  /** Upstream video URL (auto-populated by flow) */
  sourceVideo?: string
  /** Upstream person image URL (auto-populated by flow) */
  sourceImage?: string
  /** wan-std | wan-pro */
  mode: string
  status: NodeStatus
  progress: number
  outputVideo?: string
  errorMessage?: string
  [key: string]: unknown
}

export interface VideoDisplayNodeData {
  label: string
  videos: string[]
  status: NodeStatus
  [key: string]: unknown
}

export interface VideoEditNodeData {
  label: string
  prompt: string
  sourceVideo?: string
  upstreamReferenceImages: string[]
  referenceImages: string[]
  veditModel?: string
  adapter: VideoGenAdapter
  /** Per-node Seedance version override: "1.5" (legacy: HappyHorse / 万相) | "2.0" (Seedance 2.0 r2v) */
  seedanceVersion?: '1.5' | '2.0'
  resolution: string
  status: NodeStatus
  progress: number
  creditCost: number
  outputVideo?: string
  outputLastFrame?: string
  lastRunSignature?: string
  resultCache?: Record<string, string>
  needsRefresh?: boolean
  errorMessage?: string
  /** Seedance 2.0 parameters */
  generateAudio: boolean
  videoResolution: string
  negativePrompt: string
  seed: number
  cameraFixed: boolean
  returnLastFrame: boolean
  durationSeconds: number
  [key: string]: unknown
}

export type HappyHorseVideoMode = 't2v' | 'i2v' | 'r2v'

export interface ImageUnderstandNodeData {
  label: string
  /** Upstream image URL (auto-populated by flow) */
  imageUrl?: string
  /** AI-generated scene understanding text */
  description?: string
  /** AI-generated targeted prompt text */
  generatedPrompt?: string
  /** Whether description generation is in progress */
  isGenerating?: boolean
  /** Whether prompt generation is in progress */
  isGeneratingPrompt?: boolean
  /** Error message */
  errorMessage?: string
  [key: string]: unknown
}

export interface SceneNodeData {
  label: string
  collapsed?: boolean
  title: string
  synopsis: string
  beat: string
  notes: string
  [key: string]: unknown
}

export interface CharacterNodeData {
  label: string
  collapsed?: boolean
  name: string
  role: string
  appearance: string
  temperamentTags?: string[]
  stateTags?: string[]
  wardrobe: string
  props: string
  notes: string
  referenceImages: string[]
  threeViewSheetImage?: string
  threeViewImages: CharacterThreeViewImages
  generatedThreeViewImages?: CharacterThreeViewImages
  [key: string]: unknown
}

export interface CharacterLibNodeData {
  label: string
  /** Currently selected character ID from the library */
  selectedCharacterId?: string
  /** CDN URL of the selected character (auto-populated) */
  selectedCharacterCdnUrl?: string
  selectedCharacterName?: string
  selectedCharacterThumbnail?: string
  /** Prompt for inline character generation */
  genPrompt: string
  isGenerating: boolean
  status: NodeStatus
  progress: number
  errorMessage?: string
  [key: string]: unknown
}

export interface StyleNodeData {
  label: string
  collapsed?: boolean
  name: string
  keywords: string
  palette: string
  lighting: string
  framing: string
  styleTags?: string[]
  paletteTags?: string[]
  lightingTags?: string[]
  framingTags?: string[]
  qualityTags?: string[]
  notes: string
  [key: string]: unknown
}

export interface ContinuityNodeData {
  label: string
  collapsed?: boolean
  prompt: string
  frames: string[]
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  resolution?: '1K' | '2K' | '4K'
  adapter?: ImageGenAdapter
  contextSignature?: string
  status?: NodeStatus
  progress?: number
  creditCost?: number
  outputImage?: string
  lastRunSignature?: string
  resultCache?: Record<string, string>
  needsRefresh?: boolean
  errorMessage?: string
  [key: string]: unknown
}

export interface ShotNodeData {
  label: string
  collapsed?: boolean
  title: string
  description: string
  prompt: string
  continuityFrames: string[]
  videoFirstFrame?: string
  videoLastFrame?: string
  shotSize: ShotSize
  cameraAngle: CameraAngle
  cameraMovement?: string
  composition?: string
  lightingStyle?: string
  moodTags?: string[]
  qualityTags?: string[]
  motion: string
  emotion: string
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  resolution: '1K' | '2K' | '4K'
  outputType: ShotOutputType
  imageAdapter: ImageGenAdapter
  videoAdapter: VideoGenAdapter
  durationSeconds: number
  motionStrength: number
  identityLock: boolean
  identityStrength: number
  referenceImages: string[]
  contextSignature?: string
  status: NodeStatus
  progress: number
  creditCost: number
  outputImage?: string
  outputVideo?: string
  lastRunSignature?: string
  resultCache?: Record<string, string>
  needsRefresh?: boolean
  errorMessage?: string
  [key: string]: unknown
}

export type ImageUploadNode = Node<ImageUploadNodeData, 'imageUpload'>
export type ImageGenNode = Node<ImageGenNodeData, 'imageGen'>
export type ThreeViewGenNode = Node<ThreeViewGenNodeData, 'threeViewGen'>
export type ImageDisplayNode = Node<ImageDisplayNodeData, 'imageDisplay'>
export type VideoGenNode = Node<VideoGenNodeData, 'videoGen'>
export type VideoDisplayNode = Node<VideoDisplayNodeData, 'videoDisplay'>
export type VideoEditNode = Node<VideoEditNodeData, 'videoEdit'>
export type SceneNode = Node<SceneNodeData, 'scene'>
export type CharacterNode = Node<CharacterNodeData, 'character'>
export type CharacterLibNode = Node<CharacterLibNodeData, 'characterLib'>
export type StyleNode = Node<StyleNodeData, 'style'>
export type ContinuityNode = Node<ContinuityNodeData, 'continuity'>
export type ShotNode = Node<ShotNodeData, 'shot'>
export type ImageUnderstandNode = Node<ImageUnderstandNodeData, 'imageUnderstand'>
export type VideoUploadNode = Node<VideoUploadNodeData, 'videoUpload'>
export type AnimateMixNode = Node<AnimateMixNodeData, 'animateMix'>

export interface DigitalHumanNodeData {
  label: string
  /** Speech text for TTS */
  text: string
  /** Upstream character image URL (auto-populated by flow) */
  sourceImage?: string
  /** TTS speaker ID */
  voice: string
  /** S2V resolution: 480P | 720P */
  resolution: '480P' | '720P'
  /** S2V style: speech | singing | performance */
  style: 'speech' | 'singing' | 'performance'
  /** Input mode: text-driven (TTS) or audio-driven (upload) */
  inputMode: 'text' | 'audio'
  /** Uploaded audio URL (for audio upload mode, bypasses TTS) */
  audioUrl?: string
  /** Uploaded audio file name */
  audioFileName?: string
  /** Audio file uploading */
  isUploading?: boolean
  /** Audio upload error */
  uploadError?: string
  /** TTS standalone export: generated audio URL */
  ttsAudioUrl?: string
  /** TTS export in progress */
  isTTSExporting?: boolean
  status: NodeStatus
  progress: number
  outputVideo?: string
  errorMessage?: string
  [key: string]: unknown
}

export type DigitalHumanNode = Node<DigitalHumanNodeData, 'digitalHuman'>

export interface ImageUpscaleNodeData {
  label: string
  /** Fixed upscale prompt, editable by user */
  prompt: string
  /** Target resolution for upscale output */
  targetResolution: '1K' | '2K' | '4K'
  /** Fixed adapter: always uses Volcengine Seedream image-to-image */
  adapter: 'volcengine'
  /** Upstream source image URL (auto-populated by flow) */
  sourceImage?: string
  status: NodeStatus
  progress: number
  creditCost: number
  outputImage?: string
  outputImageOriginalUrl?: string
  lastRunSignature?: string
  resultCache?: Record<string, string>
  needsRefresh?: boolean
  errorMessage?: string
  [key: string]: unknown
}

export type ImageUpscaleNode = Node<ImageUpscaleNodeData, 'imageUpscale'>

export interface VideoConcatNodeData {
  label: string
  /** Upstream video URLs (auto-populated by flow) */
  sourceVideos: string[]
  status: NodeStatus
  progress: number
  outputVideo?: string
  errorMessage?: string
  [key: string]: unknown
}

export type VideoConcatNode = Node<VideoConcatNodeData, 'videoConcat'>

export interface TTSNodeData {
  label: string
  /** Speech text to synthesize */
  text: string
  /** TTS speaker ID */
  voice: string
  /** Speech rate offset (-50 ~ +100, 0 = normal) */
  speechRate?: number
  /** Loudness rate offset (-50 ~ +100, 0 = normal) */
  loudnessRate?: number
  /** Generated audio URL */
  ttsAudioUrl?: string
  /** TTS generation in progress */
  isTTSExporting?: boolean
  status: NodeStatus
  errorMessage?: string
  [key: string]: unknown
}

export type TTSNode = Node<TTSNodeData, 'tts'>

export type AppNode =
  | ImageUploadNode
  | ImageGenNode
  | ThreeViewGenNode
  | ImageDisplayNode
  | VideoGenNode
  | VideoDisplayNode
  | VideoEditNode
  | SceneNode
  | CharacterNode
  | CharacterLibNode
  | StyleNode
  | ContinuityNode
  | ShotNode
  | ImageUnderstandNode
  | VideoUploadNode
  | AnimateMixNode
  | DigitalHumanNode
  | TTSNode
  | ImageUpscaleNode
  | VideoConcatNode

export type AppNodeType =
  | 'imageUpload'
  | 'imageGen'
  | 'threeViewGen'
  | 'imageDisplay'
  | 'videoGen'
  | 'videoDisplay'
  | 'videoEdit'
  | 'videoUpload'
  | 'scene'
  | 'character'
  | 'style'
  | 'continuity'
  | 'shot'
  | 'imageUnderstand'
  | 'animateMix'
  | 'digitalHuman'
  | 'tts'
  | 'imageUpscale'
  | 'videoConcat'
  | 'characterLib'

export interface NodeTypeInfo {
  type: AppNodeType
  label: string
  description: string
  icon: string
  defaultData: Record<string, unknown>
}

export type NodeCreationData = Record<string, unknown>

export interface NodeCreationPayload {
  type: AppNodeType
  data?: NodeCreationData
}

export type AppEdge = Edge
