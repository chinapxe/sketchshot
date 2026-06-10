/**
 * API client helpers.
 */
import { config } from '../config'
import type {
  ClonedVoiceListResponse,
  VoiceCloneRequest,
  VoiceCloneResponse,
} from '../config/ttsVoices'

const BASE = config.apiBaseUrl

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? ''
    let errorMessage = `请求失败: ${response.status}`

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

export interface UserTemplateListItem {
  id: string
  name: string
  node_count: number
  created_at: string
  updated_at: string
}

export interface UserTemplateData {
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

export function listUserTemplates(): Promise<UserTemplateListItem[]> {
  return request('/api/templates')
}

export function getUserTemplate(id: string): Promise<UserTemplateData> {
  return request(`/api/templates/${id}`)
}

export function createUserTemplate(data: { name: string; nodes: unknown[]; edges: unknown[] }): Promise<UserTemplateData> {
  return request('/api/templates', { method: 'POST', body: JSON.stringify(data) })
}

export function deleteUserTemplate(id: string): Promise<{ code: number; message: string }> {
  return request(`/api/templates/${id}`, { method: 'DELETE' })
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
  negative_prompt?: string
}

export interface VideoGenerateRequest {
  node_id: string
  prompt: string
  aspect_ratio: string
  duration_seconds: number
  motion_strength: number
  source_images: string[]
  reference_images?: string[]
  adapter: string
  task_type?: string
  seedance_version?: string
  generate_audio?: boolean
  with_audio?: boolean
  happyhorse_mode?: string
  video_resolution?: string
  negative_prompt?: string
  seed?: number
  camera_fixed?: boolean
  video_model_tier?: string
  return_last_frame?: boolean
  reference_videos?: string[]
  reference_audios?: string[]
  multi_image_role?: 'transition' | 'reference'
}

export interface PromptGenerateRequest {
  task_type: 'image' | 'video' | 'general'
  user_input: string
  style: string
  aspect_ratio: string
  extra_requirements: string[]
  reference_images?: string[]
  language: 'zh' | 'en'
}

export interface PromptGenerateResponse {
  prompt: string
  task_type: 'image' | 'video' | 'general'
  model: string
}

export interface ContinuityFramesGenerateRequest {
  user_input: string
  reference_images?: string[]
  language: 'zh' | 'en'
}

export interface ContinuityFramesGenerateResponse {
  frames: string[]
  model: string
}

export interface ImageUnderstandRequest {
  image_url: string
}

export interface ImageUnderstandResponse {
  description: string
  model: string
}

export interface ImageUnderstandPromptRequest {
  description: string
}

export interface ImageUnderstandPromptResponse {
  prompt: string
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
  output_last_frame?: string | null
  error_message: string | null
}

export function createGenerateTask(req: GenerateRequest): Promise<GenerateResponse> {
  return request('/api/generate', { method: 'POST', body: JSON.stringify(req) })
}

export interface VideoEditGenerateRequest {
  node_id: string
  prompt: string
  source_video?: string
  reference_images: string[]
  adapter: string
  resolution: string
  vedit_model?: string
  seedance_version?: '1.5' | '2.0'
  /** Seedance 2.0 parameters */
  generate_audio?: boolean
  video_resolution?: string
  negative_prompt?: string
  seed?: number
  camera_fixed?: boolean
  return_last_frame?: boolean
  duration_seconds?: number
}

export function createVideoGenerateTask(req: VideoGenerateRequest): Promise<GenerateResponse> {
  return request('/api/generate/video', { method: 'POST', body: JSON.stringify(req) })
}

export function createVideoEditTask(req: VideoEditGenerateRequest): Promise<GenerateResponse> {
  return request('/api/generate/video/edit', { method: 'POST', body: JSON.stringify(req) })
}

export interface AnimateMixGenerateRequest {
  node_id: string
  source_video: string
  source_image: string
  mode: string
  adapter: string
}

export function createAnimateMixTask(req: AnimateMixGenerateRequest): Promise<GenerateResponse> {
  return request('/api/generate/video/animate-mix', { method: 'POST', body: JSON.stringify(req) })
}

export interface DigitalHumanGenerateRequest {
  node_id: string
  text: string
  source_image: string
  audio_url?: string
  voice: string
  style: 'speech' | 'singing' | 'performance'
  resolution: '480P' | '720P'
  adapter: string
}

export function createDigitalHumanTask(req: DigitalHumanGenerateRequest): Promise<GenerateResponse> {
  return request('/api/generate/video/digital-human', { method: 'POST', body: JSON.stringify(req) })
}

export interface TTSGenerateRequest {
  node_id: string
  text: string
  voice: string
  /** TTS provider: auto / volcengine / dashscope. Default: auto. */
  tts_provider?: string
  /** Speech rate offset (-50 ~ +100, 0 = normal). Optional. */
  speech_rate?: number
  /** Loudness rate offset (-50 ~ +100, 0 = normal). Optional. */
  loudness_rate?: number
}

export interface TTSGenerateResponse {
  success: boolean
  audio_url: string
  error?: string
}

export function createTTSAudioTask(req: TTSGenerateRequest): Promise<TTSGenerateResponse> {
  return request('/api/generate/tts', { method: 'POST', body: JSON.stringify(req) })
}

// ------------------------------------------------------------------
// Character library API
// ------------------------------------------------------------------

export interface CharacterItem {
  id: string
  name: string
  cdn_url: string
  thumbnail_url: string
  prompt: string
  created_at: number
  expires_at: number
}

export interface CharacterListResponse {
  characters: CharacterItem[]
}

export interface CharacterSaveRequest {
  name: string
  cdn_url: string
  prompt?: string
  thumbnail_url?: string
}

export function listCharacters(): Promise<CharacterListResponse> {
  return request('/api/assets/characters')
}

export function saveCharacter(req: CharacterSaveRequest): Promise<CharacterItem> {
  return request('/api/assets/characters', { method: 'POST', body: JSON.stringify(req) })
}

export function deleteCharacter(characterId: string): Promise<{ detail: string }> {
  return request(`/api/assets/characters/${encodeURIComponent(characterId)}`, { method: 'DELETE' })
}

// ------------------------------------------------------------------
// Official virtual human portrait library API
// ------------------------------------------------------------------

export interface OfficialCharacterItem {
  asset_id: string
  title: string
  description: string
  metadata: Record<string, unknown>
  thumbnail: string
}

export interface OfficialCharacterListResponse {
  characters: OfficialCharacterItem[]
  total: number
  console_url: string
}

export function listOfficialCharacters(): Promise<OfficialCharacterListResponse> {
  return request('/api/assets/official-characters')
}

export interface ThumbnailRefreshResponse {
  thumbnails: Record<string, string>
}

export function refreshOfficialThumbnails(): Promise<ThumbnailRefreshResponse> {
  return request('/api/assets/official-characters/thumbnails', { method: 'POST' })
}

// ------------------------------------------------------------------
// Voice cloning API
// ------------------------------------------------------------------

export function cloneVoice(req: VoiceCloneRequest): Promise<VoiceCloneResponse> {
  return request('/api/generate/voice-clone', { method: 'POST', body: JSON.stringify(req) })
}

export function listClonedVoices(): Promise<ClonedVoiceListResponse> {
  return request('/api/generate/voice-clone')
}

export function deleteClonedVoice(voiceId: string): Promise<{ success: boolean; voice_id: string }> {
  return request(`/api/generate/voice-clone/${encodeURIComponent(voiceId)}`, { method: 'DELETE' })
}

export function generatePrompt(req: PromptGenerateRequest): Promise<PromptGenerateResponse> {
  return request('/api/prompts/generate', { method: 'POST', body: JSON.stringify(req) })
}

export function generateContinuityFrames(
  req: ContinuityFramesGenerateRequest
): Promise<ContinuityFramesGenerateResponse> {
  return request('/api/prompts/continuity/frames', { method: 'POST', body: JSON.stringify(req) })
}

export function imageUnderstandApi(
  data: ImageUnderstandRequest
): Promise<ImageUnderstandResponse> {
  return request('/api/prompts/image-understand', { method: 'POST', body: JSON.stringify(data) })
}

export function imageUnderstandPromptApi(
  data: ImageUnderstandPromptRequest
): Promise<ImageUnderstandPromptResponse> {
  return request('/api/prompts/image-understand/prompt', { method: 'POST', body: JSON.stringify(data) })
}

export interface UploadedAssetResponse {
  file_name: string
  content_type: string
  size: number
  url: string
}

export interface SplitThreeViewSheetRequest {
  asset_url: string
}

export interface SplitThreeViewSheetResponse {
  front: string
  side: string
  back: string
}

export interface VolcengineConfigResponse {
  ark_base_url: string
  ark_api_key: string
  prompt_model: string
  image_model: string
  image_edit_model: string
  video_model: string
  video_v2_model: string
  video_version: string
  configured: boolean
}

export interface VolcengineConfigUpdateRequest {
  ark_base_url: string
  ark_api_key: string
  prompt_model: string
  image_model: string
  image_edit_model: string
  video_model: string
  video_v2_model: string
  video_version: string
}

export type PromptProvider = 'volcengine' | 'qwen'
export type GenerateProvider = 'volcengine' | 'wanx' | 'happyhorse' | 'mock'

export interface DashScopeConfigResponse {
  base_url: string
  api_key: string
  qwen_text_model: string
  qwen_multimodal_model: string
  wanx_image_model: string
  wanx_video_model: string
  wanx_video_resolution: '720P' | '1080P'
  wanx_watermark: boolean
  happyhorse_t2v_model: string
  happyhorse_i2v_model: string
  happyhorse_r2v_model: string
  happyhorse_vedit_model: string
  happyhorse_video_resolution: string
  animate_mix_model: string
  s2v_model: string
  voice_enrollment_model: string
  tts_vc_model: string
  configured: boolean
  oss_region: string
  oss_endpoint: string
  oss_access_key_id: string
  oss_access_key_secret: string
  oss_bucket: string
  oss_key_prefix: string
  oss_configured: boolean
}

export interface DashScopeConfigUpdateRequest {
  base_url: string
  api_key: string
  qwen_text_model: string
  qwen_multimodal_model: string
  wanx_image_model: string
  wanx_video_model: string
  wanx_video_resolution: '720P' | '1080P'
  wanx_watermark: boolean
  happyhorse_t2v_model: string
  happyhorse_i2v_model: string
  happyhorse_r2v_model: string
  happyhorse_vedit_model: string
  happyhorse_video_resolution: string
  animate_mix_model: string
  s2v_model: string
  voice_enrollment_model: string
  tts_vc_model: string
  oss_region: string
  oss_endpoint: string
  oss_access_key_id: string
  oss_access_key_secret: string
  oss_bucket: string
  oss_key_prefix: string
}

export interface EngineSettingsResponse {
  prompt_provider: PromptProvider
  generate_provider: GenerateProvider
  volcengine: VolcengineConfigResponse
  dashscope: DashScopeConfigResponse
}

export interface EngineSettingsUpdateRequest {
  prompt_provider: PromptProvider
  generate_provider: GenerateProvider
  volcengine: VolcengineConfigUpdateRequest
  dashscope: DashScopeConfigUpdateRequest
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
    throw new Error(`上传失败: ${response.status}`)
  }

  return response.json()
}

export function splitThreeViewSheet(
  data: SplitThreeViewSheetRequest
): Promise<SplitThreeViewSheetResponse> {
  return request('/api/assets/split-three-view', { method: 'POST', body: JSON.stringify(data) })
}

export function getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  return request(`/api/generate/${taskId}/status`)
}

export function healthCheck(): Promise<{ status: string; app: string; adapters: string[] }> {
  return request('/api/health')
}

export function getVolcengineConfig(): Promise<VolcengineConfigResponse> {
  return request('/api/settings/engines/volcengine')
}

export function updateVolcengineConfig(
  data: VolcengineConfigUpdateRequest
): Promise<VolcengineConfigResponse> {
  return request('/api/settings/engines/volcengine', { method: 'PUT', body: JSON.stringify(data) })
}

export function getDashScopeConfig(): Promise<DashScopeConfigResponse> {
  return request('/api/settings/engines/dashscope')
}

export function updateDashScopeConfig(
  data: DashScopeConfigUpdateRequest
): Promise<DashScopeConfigResponse> {
  return request('/api/settings/engines/dashscope', { method: 'PUT', body: JSON.stringify(data) })
}

export function getEngineSettings(): Promise<EngineSettingsResponse> {
  return request('/api/settings/engines')
}

export interface ConcatVideosRequest {
  video_urls: string[]
}

export interface ConcatVideosResponse {
  output_video: string
}

export function concatVideos(req: ConcatVideosRequest): Promise<ConcatVideosResponse> {
  return request('/api/assets/concat-videos', { method: 'POST', body: JSON.stringify(req) })
}

export function updateEngineSettings(
  data: EngineSettingsUpdateRequest
): Promise<EngineSettingsResponse> {
  return request('/api/settings/engines', { method: 'PUT', body: JSON.stringify(data) })
}
