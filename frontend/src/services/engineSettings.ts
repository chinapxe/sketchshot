import {
  getEngineSettings,
  type EngineSettingsResponse,
  type GenerateProvider,
} from './api'
import type { ImageGenAdapter, VideoGenAdapter } from '../types'

let engineSettingsCache: EngineSettingsResponse | null = null
let engineSettingsPromise: Promise<EngineSettingsResponse> | null = null

export type SupportedImageAdapter = Extract<ImageGenAdapter, 'volcengine' | 'wanx'>
export type SupportedVideoAdapter = Extract<VideoGenAdapter, 'volcengine' | 'wanx'>

export const supportedImageAdapterOptions: Array<{ value: SupportedImageAdapter; label: string }> = [
  { value: 'wanx', label: '万相' },
  { value: 'volcengine', label: '火山' },
]

export const supportedVideoAdapterOptions: Array<{ value: SupportedVideoAdapter; label: string }> = [
  { value: 'wanx', label: '万相' },
  { value: 'volcengine', label: '火山' },
]

export async function loadEngineSettings(forceRefresh = false): Promise<EngineSettingsResponse> {
  if (!forceRefresh && engineSettingsCache) {
    return engineSettingsCache
  }

  if (!forceRefresh && engineSettingsPromise) {
    return engineSettingsPromise
  }

  engineSettingsPromise = getEngineSettings()
    .then((settings) => {
      engineSettingsCache = settings
      return settings
    })
    .finally(() => {
      engineSettingsPromise = null
    })

  return engineSettingsPromise
}

export function primeEngineSettingsCache(settings: EngineSettingsResponse): void {
  engineSettingsCache = settings
}

export function clearEngineSettingsCache(): void {
  engineSettingsCache = null
}

function resolveImageProvider(provider: GenerateProvider): SupportedImageAdapter {
  if (provider === 'wanx') {
    return 'wanx'
  }

  return 'volcengine'
}

function resolveVideoProvider(provider: GenerateProvider): SupportedVideoAdapter {
  if (provider === 'wanx') {
    return 'wanx'
  }

  return 'volcengine'
}

export async function resolveImageAdapter(adapter: ImageGenAdapter): Promise<SupportedImageAdapter> {
  if (adapter !== 'auto') {
    return getSupportedImageAdapterValue(adapter)
  }

  const settings = await loadEngineSettings()
  return resolveImageProvider(settings.generate_provider)
}

export async function resolveVideoAdapter(adapter: VideoGenAdapter): Promise<SupportedVideoAdapter> {
  if (adapter !== 'auto') {
    return getSupportedVideoAdapterValue(adapter)
  }

  const settings = await loadEngineSettings()
  return resolveVideoProvider(settings.generate_provider)
}

export function getSupportedImageAdapterValue(adapter: ImageGenAdapter | undefined): SupportedImageAdapter {
  return adapter === 'wanx' ? 'wanx' : 'volcengine'
}

export function getSupportedVideoAdapterValue(adapter: VideoGenAdapter | undefined): SupportedVideoAdapter {
  return adapter === 'wanx' ? 'wanx' : 'volcengine'
}

export async function resolveVisibleImageAdapter(
  adapter: ImageGenAdapter | undefined
): Promise<SupportedImageAdapter> {
  if (adapter === 'auto') {
    const settings = await loadEngineSettings()
    return resolveImageProvider(settings.generate_provider)
  }

  return getSupportedImageAdapterValue(adapter)
}

export async function resolveVisibleVideoAdapter(
  adapter: VideoGenAdapter | undefined
): Promise<SupportedVideoAdapter> {
  if (adapter === 'auto') {
    const settings = await loadEngineSettings()
    return resolveVideoProvider(settings.generate_provider)
  }

  return getSupportedVideoAdapterValue(adapter)
}
