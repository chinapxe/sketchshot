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
export type ImageGenAdapter = 'auto' | 'mock' | 'comfyui' | 'volcengine'
export type VideoGenAdapter = 'mock' | 'volcengine'
export type ShotOutputType = 'image' | 'video'
export type ShotSize = 'extreme-close-up' | 'close-up' | 'medium' | 'wide' | 'establishing'
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
  status: NodeStatus
  progress: number
  creditCost: number
  outputImage?: string
  lastRunSignature?: string
  resultCache?: Record<string, string>
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

export interface VideoDisplayNodeData {
  label: string
  videos: string[]
  status: NodeStatus
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
  wardrobe: string
  props: string
  notes: string
  referenceImages: string[]
  threeViewImages: CharacterThreeViewImages
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
  notes: string
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
export type ImageDisplayNode = Node<ImageDisplayNodeData, 'imageDisplay'>
export type VideoGenNode = Node<VideoGenNodeData, 'videoGen'>
export type VideoDisplayNode = Node<VideoDisplayNodeData, 'videoDisplay'>
export type SceneNode = Node<SceneNodeData, 'scene'>
export type CharacterNode = Node<CharacterNodeData, 'character'>
export type StyleNode = Node<StyleNodeData, 'style'>
export type ShotNode = Node<ShotNodeData, 'shot'>

export type AppNode =
  | ImageUploadNode
  | ImageGenNode
  | ImageDisplayNode
  | VideoGenNode
  | VideoDisplayNode
  | SceneNode
  | CharacterNode
  | StyleNode
  | ShotNode

export type AppNodeType =
  | 'imageUpload'
  | 'imageGen'
  | 'imageDisplay'
  | 'videoGen'
  | 'videoDisplay'
  | 'scene'
  | 'character'
  | 'style'
  | 'shot'

export interface NodeTypeInfo {
  type: AppNodeType
  label: string
  description: string
  icon: string
  defaultData: Record<string, unknown>
}

export type AppEdge = Edge
