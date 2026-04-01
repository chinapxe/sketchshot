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

export type ImageUploadNode = Node<ImageUploadNodeData, 'imageUpload'>
export type ImageGenNode = Node<ImageGenNodeData, 'imageGen'>
export type ImageDisplayNode = Node<ImageDisplayNodeData, 'imageDisplay'>
export type VideoGenNode = Node<VideoGenNodeData, 'videoGen'>
export type VideoDisplayNode = Node<VideoDisplayNodeData, 'videoDisplay'>

export type AppNode =
  | ImageUploadNode
  | ImageGenNode
  | ImageDisplayNode
  | VideoGenNode
  | VideoDisplayNode

export type AppNodeType = 'imageUpload' | 'imageGen' | 'imageDisplay' | 'videoGen' | 'videoDisplay'

export interface NodeTypeInfo {
  type: AppNodeType
  label: string
  description: string
  icon: string
  defaultData: Record<string, unknown>
}

export type AppEdge = Edge
