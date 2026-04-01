/**
 * API client helpers.
 */
import { config } from '../config'

const BASE = config.apiBaseUrl

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? ''
    let errorMessage = `Request failed: ${response.status}`

    if (contentType.includes('application/json')) {
      try {
        const errorBody = await response.json() as {
          detail?: string
          message?: string
          error?: { message?: string } | string
        }
        errorMessage = errorBody.detail
          ?? errorBody.message
          ?? (typeof errorBody.error === 'string'
            ? errorBody.error
            : errorBody.error?.message)
          ?? errorMessage
        console.error(`[api] request failed: ${response.status} ${url}`, errorBody)
      } catch (error) {
        console.error(`[api] failed to parse error response: ${response.status} ${url}`, error)
      }
    } else {
      const errorBody = await response.text()
      console.error(`[api] request failed: ${response.status} ${url}`, errorBody)
      if (errorBody.trim()) {
        errorMessage = errorBody
      }
    }

    throw new Error(errorMessage)
  }

  return response.json()
}

export interface WorkflowListItem {
  id: string
  name: string
  node_count: number
  created_at: string
  updated_at: string
}

export interface WorkflowData {
  id: string
  name: string
  nodes: unknown[]
  edges: unknown[]
  created_at: string
  updated_at: string
}

export function listWorkflows(): Promise<WorkflowListItem[]> {
  return request('/api/workflows')
}

export function getWorkflow(id: string): Promise<WorkflowData> {
  return request(`/api/workflows/${id}`)
}

export function createWorkflow(data: { name: string; nodes: unknown[]; edges: unknown[] }): Promise<WorkflowData> {
  return request('/api/workflows', { method: 'POST', body: JSON.stringify(data) })
}

export function updateWorkflow(
  id: string,
  data: { name: string; nodes: unknown[]; edges: unknown[] }
): Promise<WorkflowData> {
  return request(`/api/workflows/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export function deleteWorkflow(id: string): Promise<{ code: number; message: string }> {
  return request(`/api/workflows/${id}`, { method: 'DELETE' })
}

export interface GenerateRequest {
  node_id: string
  prompt: string
  aspect_ratio: string
  resolution: string
  reference_images: string[]
  adapter: string
  identity_lock: boolean
  identity_strength: number
}

export interface VideoGenerateRequest {
  node_id: string
  prompt: string
  aspect_ratio: string
  duration_seconds: number
  motion_strength: number
  source_images: string[]
  adapter: string
}

export interface PromptGenerateRequest {
  task_type: 'image' | 'video' | 'general'
  user_input: string
  style: string
  aspect_ratio: string
  extra_requirements: string[]
  language: 'zh' | 'en'
}

export interface PromptGenerateResponse {
  prompt: string
  task_type: 'image' | 'video' | 'general'
  model: string
}

export interface GenerateResponse {
  task_id: string
  node_id: string
  status: string
  message: string
}

export interface TaskStatusResponse {
  task_id: string
  node_id: string
  status: string
  progress: number
  output_image: string | null
  output_video: string | null
  error_message: string | null
}

export function createGenerateTask(req: GenerateRequest): Promise<GenerateResponse> {
  return request('/api/generate', { method: 'POST', body: JSON.stringify(req) })
}

export function createVideoGenerateTask(req: VideoGenerateRequest): Promise<GenerateResponse> {
  return request('/api/generate/video', { method: 'POST', body: JSON.stringify(req) })
}

export function generatePrompt(req: PromptGenerateRequest): Promise<PromptGenerateResponse> {
  return request('/api/prompts/generate', { method: 'POST', body: JSON.stringify(req) })
}

export interface UploadedAssetResponse {
  file_name: string
  content_type: string
  size: number
  url: string
}

export async function uploadImageAsset(file: File): Promise<UploadedAssetResponse> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${BASE}/api/assets/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`[api] upload failed: ${response.status} /api/assets/upload`, errorBody)
    throw new Error(`Upload failed: ${response.status}`)
  }

  return response.json()
}

export function getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  return request(`/api/generate/${taskId}/status`)
}

export function healthCheck(): Promise<{ status: string; app: string; adapters: string[] }> {
  return request('/api/health')
}
