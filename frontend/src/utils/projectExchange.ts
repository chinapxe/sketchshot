import type {
  AppEdge,
  AppNode,
  CharacterNodeData,
  CharacterThreeViewImages,
  ImageDisplayNodeData,
  ImageGenNodeData,
  ImageUploadNodeData,
  NodeStatus,
  ShotNodeData,
  VideoDisplayNodeData,
  VideoGenNodeData,
} from '../types'
import {
  getStoredAssetBlob,
  isLocalAssetUrl,
  persistBrowserAssetUrl,
  removeLocalAssetUrls,
  resolveBrowserAssetUrl,
} from './localAssetStore'
import {
  createZipBlob,
  decodeTextFile,
  encodeTextFile,
  isZipData,
  readZipEntries,
  type ZipEntryInput,
  type ZipEntryOutput,
} from './zip'

export interface ProjectExchangePayload {
  workflowId: string | null
  name: string
  nodes: AppNode[]
  edges: AppEdge[]
}

interface ProjectAssetManifestEntry {
  path: string
  mimeType: string
  originalUrl: string
}

interface ProjectExchangeFile {
  format: 'sketchshot-project' | 'wxhb-project'
  version: '1.0'
  exportedAt: string
  workflowId: string | null
  name: string
  nodes: AppNode[]
  edges: AppEdge[]
  assets?: ProjectAssetManifestEntry[]
}

interface ProjectExchangePackageResult {
  blob: Blob
  fileName: string
  assetCount: number
}

interface AssetSourceCandidate {
  url: string
  suggestedName: string
}

const PROJECT_EXCHANGE_FORMAT = 'sketchshot-project'
const LEGACY_PROJECT_EXCHANGE_FORMAT = 'wxhb-project'
const PROJECT_EXCHANGE_VERSION = '1.0'
const PROJECT_JSON_ENTRY_NAME = 'project.sketchshot.json'
const LEGACY_PROJECT_JSON_ENTRY_NAME = 'project.wxhb.json'
const ASSET_URL_PREFIX = 'asset://'
const LOCAL_DRAFT_STORAGE_KEY_VALUE = 'sketchshot.localDraft'
const LEGACY_LOCAL_DRAFT_STORAGE_KEY_VALUE = 'wxhb.localDraft'

const extensionByMimeType: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

export const LOCAL_DRAFT_STORAGE_KEY = LOCAL_DRAFT_STORAGE_KEY_VALUE

function getStoredDraftRawValue(storage: Storage): string | null {
  return storage.getItem(LOCAL_DRAFT_STORAGE_KEY_VALUE) ?? storage.getItem(LEGACY_LOCAL_DRAFT_STORAGE_KEY_VALUE)
}

function clearStoredDraftKeys(storage: Storage): void {
  storage.removeItem(LOCAL_DRAFT_STORAGE_KEY_VALUE)
  storage.removeItem(LEGACY_LOCAL_DRAFT_STORAGE_KEY_VALUE)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getLocalStorage(): Storage | null {
  if (typeof globalThis.localStorage !== 'undefined') {
    return globalThis.localStorage
  }

  const maybeWindow = globalThis as typeof globalThis & {
    window?: { localStorage?: Storage }
  }

  return maybeWindow.window?.localStorage ?? null
}

function replaceUnsafeFileChars(value: string): string {
  return Array.from(value, (char) => {
    const charCode = char.charCodeAt(0)
    if (charCode <= 31 || '<>:"/\\|?*'.includes(char)) {
      return '-'
    }

    return char
  }).join('')
}

function sanitizeFilePart(value: string): string {
  return replaceUnsafeFileChars(value.trim())
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'project'
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeStatusForPersistence(status: unknown): NodeStatus {
  if (status === 'queued' || status === 'processing') {
    return 'idle'
  }

  if (
    status === 'idle'
    || status === 'success'
    || status === 'error'
    || status === 'queued'
    || status === 'processing'
  ) {
    return status
  }

  return 'idle'
}

function resetTransientNodeState(node: AppNode): AppNode {
  const clonedNode = cloneJsonValue(node) as AppNode & {
    selected?: boolean
    dragging?: boolean
    resizing?: boolean
    measured?: unknown
  }

  delete clonedNode.selected
  delete clonedNode.dragging
  delete clonedNode.resizing
  delete clonedNode.measured

  if (node.type === 'imageUpload') {
    const data = clonedNode.data as ImageUploadNodeData
    data.isUploading = false
    delete data.uploadError
    return clonedNode
  }

  if (node.type === 'imageDisplay') {
    const data = clonedNode.data as ImageDisplayNodeData
    data.status = normalizeStatusForPersistence(data.status)
    return clonedNode
  }

  if (node.type === 'videoDisplay') {
    const data = clonedNode.data as VideoDisplayNodeData
    data.status = normalizeStatusForPersistence(data.status)
    return clonedNode
  }

  if (node.type === 'imageGen') {
    const data = clonedNode.data as ImageGenNodeData
    data.status = normalizeStatusForPersistence(data.status)
    data.progress = data.status === 'idle' ? 0 : data.progress
    data.isUploadingReferences = false
    delete data.referenceUploadError
    delete data.needsRefresh
    if (data.status === 'idle') {
      delete data.errorMessage
    }
    return clonedNode
  }

  if (node.type === 'videoGen') {
    const data = clonedNode.data as VideoGenNodeData
    data.status = normalizeStatusForPersistence(data.status)
    data.progress = data.status === 'idle' ? 0 : data.progress
    delete data.needsRefresh
    if (data.status === 'idle') {
      delete data.errorMessage
    }
    return clonedNode
  }

  if (node.type === 'shot') {
    const data = clonedNode.data as ShotNodeData
    data.status = normalizeStatusForPersistence(data.status)
    data.progress = data.status === 'idle' ? 0 : data.progress
    delete data.needsRefresh
    if (data.status === 'idle') {
      delete data.errorMessage
    }
    return clonedNode
  }

  return clonedNode
}

function sanitizePayload(payload: ProjectExchangePayload): ProjectExchangePayload {
  return {
    workflowId: payload.workflowId ?? null,
    name: typeof payload.name === 'string' && payload.name.trim().length > 0 ? payload.name : '未命名工作流',
    nodes: Array.isArray(payload.nodes) ? payload.nodes.map((node) => resetTransientNodeState(node)) : [],
    edges: Array.isArray(payload.edges)
      ? payload.edges.map((edge) => {
          const clonedEdge = cloneJsonValue(edge) as AppEdge & { selected?: boolean }
          delete clonedEdge.selected
          return clonedEdge
        })
      : [],
  }
}

function mapOptionalUrl(value: unknown, mapper: (url: string) => string): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return undefined
  }

  return mapper(value)
}

function mapStringArray(value: unknown, mapper: (url: string) => string): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .map((item) => mapper(item))
}

function mapResultCache(
  value: unknown,
  mapper: (url: string) => string
): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const mappedEntries = Object.entries(value).map(([key, cacheValue]) => [
    key,
    typeof cacheValue === 'string' && cacheValue.length > 0 ? mapper(cacheValue) : '',
  ])

  return Object.fromEntries(mappedEntries)
}

function mapThreeViewImages(
  value: CharacterThreeViewImages | undefined,
  mapper: (url: string) => string
): CharacterThreeViewImages {
  const mapped: CharacterThreeViewImages = {}
  const slots: Array<keyof CharacterThreeViewImages> = ['front', 'side', 'back']

  slots.forEach((slot) => {
    const nextValue = mapOptionalUrl(value?.[slot], mapper)
    if (nextValue) {
      mapped[slot] = nextValue
    }
  })

  return mapped
}

function mapNodeAssetUrls(node: AppNode, mapper: (url: string) => string): AppNode {
  const clonedNode = cloneJsonValue(node)

  if (clonedNode.type === 'imageUpload') {
    const data = clonedNode.data as ImageUploadNodeData
    data.imageUrl = mapOptionalUrl(data.imageUrl, mapper)
    return clonedNode
  }

  if (clonedNode.type === 'imageGen') {
    const data = clonedNode.data as ImageGenNodeData
    data.upstreamReferenceImages = mapStringArray(data.upstreamReferenceImages, mapper)
    data.manualReferenceImages = mapStringArray(data.manualReferenceImages, mapper)
    data.referenceImages = mapStringArray(data.referenceImages, mapper)
    data.outputImage = mapOptionalUrl(data.outputImage, mapper)
    data.resultCache = mapResultCache(data.resultCache, mapper)
    return clonedNode
  }

  if (clonedNode.type === 'imageDisplay') {
    const data = clonedNode.data as ImageDisplayNodeData
    data.images = mapStringArray(data.images, mapper)
    return clonedNode
  }

  if (clonedNode.type === 'videoGen') {
    const data = clonedNode.data as VideoGenNodeData
    data.sourceImages = mapStringArray(data.sourceImages, mapper)
    data.outputVideo = mapOptionalUrl(data.outputVideo, mapper)
    data.resultCache = mapResultCache(data.resultCache, mapper)
    return clonedNode
  }

  if (clonedNode.type === 'videoDisplay') {
    const data = clonedNode.data as VideoDisplayNodeData
    data.videos = mapStringArray(data.videos, mapper)
    return clonedNode
  }

  if (clonedNode.type === 'character') {
    const data = clonedNode.data as CharacterNodeData
    data.referenceImages = mapStringArray(data.referenceImages, mapper)
    data.threeViewImages = mapThreeViewImages(data.threeViewImages, mapper)
    return clonedNode
  }

  if (clonedNode.type === 'shot') {
    const data = clonedNode.data as ShotNodeData
    data.referenceImages = mapStringArray(data.referenceImages, mapper)
    data.videoFirstFrame = mapOptionalUrl(data.videoFirstFrame, mapper)
    data.videoLastFrame = mapOptionalUrl(data.videoLastFrame, mapper)
    data.outputImage = mapOptionalUrl(data.outputImage, mapper)
    data.outputVideo = mapOptionalUrl(data.outputVideo, mapper)
    data.resultCache = mapResultCache(data.resultCache, mapper)
    return clonedNode
  }

  return clonedNode
}

function addAssetCandidate(
  candidates: Map<string, AssetSourceCandidate>,
  url: unknown,
  suggestedName: string
): void {
  if (typeof url !== 'string' || url.length === 0 || url.startsWith(ASSET_URL_PREFIX)) {
    return
  }

  if (!candidates.has(url)) {
    candidates.set(url, {
      url,
      suggestedName,
    })
  }
}

function addAssetCandidatesFromResultCache(
  candidates: Map<string, AssetSourceCandidate>,
  value: unknown,
  suggestedName: string
): void {
  if (!isRecord(value)) {
    return
  }

  Object.values(value).forEach((cacheValue) => {
    addAssetCandidate(candidates, cacheValue, suggestedName)
  })
}

function collectProjectAssetSources(nodes: AppNode[]): AssetSourceCandidate[] {
  const candidates = new Map<string, AssetSourceCandidate>()

  nodes.forEach((node) => {
    if (node.type === 'imageUpload') {
      const data = node.data as ImageUploadNodeData
      addAssetCandidate(candidates, data.imageUrl, `${data.fileName || data.label || 'upload'}-image`)
      return
    }

    if (node.type === 'imageGen') {
      const data = node.data as ImageGenNodeData
      const baseName = sanitizeFilePart(data.label || 'image-gen')
      data.upstreamReferenceImages?.forEach((url) => addAssetCandidate(candidates, url, `${baseName}-upstream-ref`))
      data.manualReferenceImages?.forEach((url) => addAssetCandidate(candidates, url, `${baseName}-manual-ref`))
      data.referenceImages?.forEach((url) => addAssetCandidate(candidates, url, `${baseName}-reference`))
      addAssetCandidate(candidates, data.outputImage, `${baseName}-output`)
      addAssetCandidatesFromResultCache(candidates, data.resultCache, `${baseName}-cache`)
      return
    }

    if (node.type === 'imageDisplay') {
      const data = node.data as ImageDisplayNodeData
      data.images?.forEach((url, index) => addAssetCandidate(candidates, url, `${data.label || 'image-display'}-${index + 1}`))
      return
    }

    if (node.type === 'videoGen') {
      const data = node.data as VideoGenNodeData
      const baseName = sanitizeFilePart(data.label || 'video-gen')
      data.sourceImages?.forEach((url, index) => addAssetCandidate(candidates, url, `${baseName}-source-${index + 1}`))
      addAssetCandidate(candidates, data.outputVideo, `${baseName}-output`)
      addAssetCandidatesFromResultCache(candidates, data.resultCache, `${baseName}-cache`)
      return
    }

    if (node.type === 'videoDisplay') {
      const data = node.data as VideoDisplayNodeData
      data.videos?.forEach((url, index) => addAssetCandidate(candidates, url, `${data.label || 'video-display'}-${index + 1}`))
      return
    }

    if (node.type === 'character') {
      const data = node.data as CharacterNodeData
      const baseName = sanitizeFilePart(data.name || data.label || 'character')
      data.referenceImages?.forEach((url, index) => addAssetCandidate(candidates, url, `${baseName}-reference-${index + 1}`))
      addAssetCandidate(candidates, data.threeViewImages?.front, `${baseName}-front`)
      addAssetCandidate(candidates, data.threeViewImages?.side, `${baseName}-side`)
      addAssetCandidate(candidates, data.threeViewImages?.back, `${baseName}-back`)
      return
    }

    if (node.type === 'shot') {
      const data = node.data as ShotNodeData
      const baseName = sanitizeFilePart(data.title || data.label || 'shot')
      data.referenceImages?.forEach((url, index) => addAssetCandidate(candidates, url, `${baseName}-reference-${index + 1}`))
      addAssetCandidate(candidates, data.videoFirstFrame, `${baseName}-first-frame`)
      addAssetCandidate(candidates, data.videoLastFrame, `${baseName}-last-frame`)
      addAssetCandidate(candidates, data.outputImage, `${baseName}-image-output`)
      addAssetCandidate(candidates, data.outputVideo, `${baseName}-video-output`)
      addAssetCandidatesFromResultCache(candidates, data.resultCache, `${baseName}-cache`)
    }
  })

  return Array.from(candidates.values())
}

function collectReferencedAssetUrls(nodes: AppNode[]): string[] {
  return collectProjectAssetSources(nodes).map((candidate) => candidate.url)
}

function collectStoredLocalAssetUrls(nodes: AppNode[]): string[] {
  return Array.from(
    new Set(
      collectReferencedAssetUrls(nodes).filter((url) => isLocalAssetUrl(url))
    )
  )
}

function collectRuntimeLocalAssetUrls(nodes: AppNode[]): string[] {
  return Array.from(
    new Set(
      collectReferencedAssetUrls(nodes).filter((url) => url.startsWith('blob:') || isLocalAssetUrl(url))
    )
  )
}

async function persistPayloadLocalAssets(payload: ProjectExchangePayload): Promise<ProjectExchangePayload> {
  const sanitizedPayload = sanitizePayload(payload)
  const urls = collectRuntimeLocalAssetUrls(sanitizedPayload.nodes)

  if (urls.length === 0) {
    return sanitizedPayload
  }

  const resolvedEntries = await Promise.all(
    urls.map(async (url) => [url, await persistBrowserAssetUrl(url)] as const)
  )
  const urlMap = new Map(resolvedEntries)

  return {
    ...sanitizedPayload,
    nodes: sanitizedPayload.nodes.map((node) => mapNodeAssetUrls(node, (url) => urlMap.get(url) ?? url)),
  }
}

async function hydratePayloadLocalAssets(payload: ProjectExchangePayload): Promise<ProjectExchangePayload> {
  const urls = collectStoredLocalAssetUrls(payload.nodes)

  if (urls.length === 0) {
    return payload
  }

  const resolvedEntries = await Promise.all(
    urls.map(async (url) => [url, await resolveBrowserAssetUrl(url)] as const)
  )
  const urlMap = new Map(resolvedEntries)

  return {
    ...payload,
    nodes: payload.nodes.map((node) => mapNodeAssetUrls(node, (url) => urlMap.get(url) ?? url)),
  }
}

function readDraftLocalAssetUrls(content: string | null): string[] {
  if (!content) {
    return []
  }

  try {
    const payload = parseProjectExchange(content)
    return collectStoredLocalAssetUrls(payload.nodes)
  } catch {
    return []
  }
}

async function fetchAssetBlob(url: string): Promise<Blob> {
  if (isLocalAssetUrl(url)) {
    const storedBlob = await getStoredAssetBlob(url)
    if (!storedBlob) {
      throw new Error('本地草稿资源不存在')
    }

    return storedBlob
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`下载项目资源失败: ${response.status}`)
  }

  return response.blob()
}

function inferExtension(url: string, mimeType: string): string {
  if (mimeType && extensionByMimeType[mimeType]) {
    return extensionByMimeType[mimeType]
  }

  try {
    const parsedUrl = new URL(url, 'http://localhost')
    const match = parsedUrl.pathname.match(/\.([a-z0-9]{2,5})$/i)
    if (match) {
      return match[1].toLowerCase()
    }
  } catch {
    const match = url.match(/\.([a-z0-9]{2,5})(?:$|\?)/i)
    if (match) {
      return match[1].toLowerCase()
    }
  }

  return mimeType.startsWith('video/') ? 'mp4' : 'png'
}

function inferMimeTypeFromPath(path: string): string {
  const lowerPath = path.toLowerCase()

  if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) return 'image/jpeg'
  if (lowerPath.endsWith('.png')) return 'image/png'
  if (lowerPath.endsWith('.webp')) return 'image/webp'
  if (lowerPath.endsWith('.gif')) return 'image/gif'
  if (lowerPath.endsWith('.mp4')) return 'video/mp4'
  if (lowerPath.endsWith('.mov')) return 'video/quicktime'
  if (lowerPath.endsWith('.webm')) return 'video/webm'

  return 'application/octet-stream'
}

function createAssetUrl(path: string): string {
  return `${ASSET_URL_PREFIX}${path}`
}

function createObjectUrl(blob: Blob, fallbackId: string): string {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(blob)
  }

  return `${ASSET_URL_PREFIX}${fallbackId}`
}

function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

function triggerBrowserDownload(fileName: string, blob: Blob): void {
  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持浏览器下载')
  }

  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 1000)
}

function buildProjectExchangeFile(payload: ProjectExchangePayload): ProjectExchangeFile {
  const sanitizedPayload = sanitizePayload(payload)

  return {
    format: PROJECT_EXCHANGE_FORMAT,
    version: PROJECT_EXCHANGE_VERSION,
    exportedAt: new Date().toISOString(),
    workflowId: sanitizedPayload.workflowId,
    name: sanitizedPayload.name,
    nodes: sanitizedPayload.nodes,
    edges: sanitizedPayload.edges,
  }
}

function normalizeProjectExchangePayload(value: unknown): ProjectExchangePayload {
  if (!isRecord(value)) {
    throw new Error('项目文件内容无效')
  }

  const rawNodes = Array.isArray(value.nodes) ? (value.nodes as AppNode[]) : null
  const rawEdges = Array.isArray(value.edges) ? (value.edges as AppEdge[]) : null

  if (!rawNodes || !rawEdges) {
    throw new Error('项目文件缺少节点或连线数据')
  }

  return sanitizePayload({
    workflowId: typeof value.workflowId === 'string' ? value.workflowId : null,
    name: typeof value.name === 'string' && value.name.trim().length > 0 ? value.name : '未命名工作流',
    nodes: rawNodes,
    edges: rawEdges,
  })
}

function readProjectJsonEntry(entries: ZipEntryOutput[]): ZipEntryOutput {
  const directEntry = entries.find((entry) => entry.name === PROJECT_JSON_ENTRY_NAME)
  if (directEntry) {
    return directEntry
  }

  const legacyNamedEntry = entries.find((entry) => entry.name === LEGACY_PROJECT_JSON_ENTRY_NAME)
  if (legacyNamedEntry) {
    return legacyNamedEntry
  }

  const backupEntry = entries.find(
    (entry) => entry.name.endsWith('.sketchshot.json') || entry.name.endsWith('.wxhb.json')
  )
  if (backupEntry) {
    return backupEntry
  }

  const jsonEntry = entries.find((entry) => entry.name.endsWith('.json'))
  if (jsonEntry) {
    return jsonEntry
  }

  throw new Error('项目包中缺少项目描述文件')
}

function readManifestAssets(projectFile: Record<string, unknown>): ProjectAssetManifestEntry[] {
  if (!Array.isArray(projectFile.assets)) {
    return []
  }

  return projectFile.assets
    .filter(isRecord)
    .map((entry) => ({
      path: typeof entry.path === 'string'
        ? entry.path
        : typeof entry.fileName === 'string'
          ? entry.fileName
          : '',
      mimeType: typeof entry.mimeType === 'string' ? entry.mimeType : 'application/octet-stream',
      originalUrl: typeof entry.originalUrl === 'string' ? entry.originalUrl : '',
    }))
    .filter((entry) => entry.path.length > 0)
}

function readProjectExchangeZip(data: Uint8Array): ProjectExchangePayload {
  const entries = readZipEntries(data)
  const projectEntry = readProjectJsonEntry(entries)
  const projectFile = JSON.parse(decodeTextFile(projectEntry.data)) as Record<string, unknown>
  const manifestAssets = readManifestAssets(projectFile)
  const entryMap = new Map(entries.map((entry) => [entry.name, entry]))
  const assetUrlMap = new Map<string, string>()

  const resolveAssetUrl = (value: string): string => {
    if (!value.startsWith(ASSET_URL_PREFIX)) {
      return value
    }

    const assetPath = value.slice(ASSET_URL_PREFIX.length)
    if (assetUrlMap.has(assetPath)) {
      return assetUrlMap.get(assetPath)!
    }

    const entry = entryMap.get(assetPath)
    if (!entry) {
      throw new Error(`项目包缺少资源文件: ${assetPath}`)
    }

    const manifestEntry = manifestAssets.find((item) => item.path === assetPath)
    const mimeType = manifestEntry?.mimeType || inferMimeTypeFromPath(assetPath)
    const objectUrl = createObjectUrl(new Blob([toArrayBuffer(entry.data)], { type: mimeType }), assetPath)
    assetUrlMap.set(assetPath, objectUrl)
    return objectUrl
  }

  const payload = normalizeProjectExchangePayload(projectFile)

  return {
    ...payload,
    nodes: payload.nodes.map((node) => mapNodeAssetUrls(node, resolveAssetUrl)),
  }
}

export function serializeProjectExchange(payload: ProjectExchangePayload): string {
  return JSON.stringify(buildProjectExchangeFile(payload), null, 2)
}

export function parseProjectExchange(content: string): ProjectExchangePayload {
  const parsed = JSON.parse(content) as Record<string, unknown>

  if (
    parsed.format
    && parsed.format !== PROJECT_EXCHANGE_FORMAT
    && parsed.format !== LEGACY_PROJECT_EXCHANGE_FORMAT
  ) {
    throw new Error('不支持的项目文件格式')
  }

  return normalizeProjectExchangePayload(parsed)
}

export function readProjectExchangeData(data: Uint8Array): ProjectExchangePayload {
  if (isZipData(data)) {
    return readProjectExchangeZip(data)
  }

  return parseProjectExchange(decodeTextFile(data))
}

export async function readProjectExchangeFile(file: Blob): Promise<ProjectExchangePayload> {
  const buffer = await file.arrayBuffer()
  const payload = readProjectExchangeData(new Uint8Array(buffer))
  const persistedPayload = await persistPayloadLocalAssets(payload)

  return hydratePayloadLocalAssets(persistedPayload)
}

export async function createProjectExchangePackageBlob(
  payload: ProjectExchangePayload
): Promise<ProjectExchangePackageResult> {
  const projectFile = buildProjectExchangeFile(payload)
  const assetSources = collectProjectAssetSources(projectFile.nodes)
  const zipEntries: ZipEntryInput[] = []
  const assetUrlToPackageUrl = new Map<string, string>()
  const manifestEntries: ProjectAssetManifestEntry[] = []

  const assetEntries = await Promise.all(
    assetSources.map(async (assetSource, index) => {
      const assetBlob = await fetchAssetBlob(assetSource.url)
      const extension = inferExtension(assetSource.url, assetBlob.type)
      const assetPath = `assets/${String(index + 1).padStart(3, '0')}-${sanitizeFilePart(assetSource.suggestedName)}.${extension}`
      const buffer = await assetBlob.arrayBuffer()

      assetUrlToPackageUrl.set(assetSource.url, createAssetUrl(assetPath))

      manifestEntries.push({
        path: assetPath,
        mimeType: assetBlob.type || inferMimeTypeFromPath(assetPath),
        originalUrl: assetSource.url,
      })

      return {
        name: assetPath,
        data: new Uint8Array(buffer),
      } satisfies ZipEntryInput
    })
  )

  zipEntries.push(...assetEntries)

  const packagedProjectFile: ProjectExchangeFile = {
    ...projectFile,
    nodes: projectFile.nodes.map((node) =>
      mapNodeAssetUrls(node, (url) => assetUrlToPackageUrl.get(url) ?? url)
    ),
    assets: manifestEntries,
  }

  zipEntries.push({
    name: PROJECT_JSON_ENTRY_NAME,
    data: encodeTextFile(JSON.stringify(packagedProjectFile, null, 2)),
  })

  const fileName = `${sanitizeFilePart(projectFile.name || 'workflow-project')}.sketchshot.zip`

  return {
    blob: createZipBlob(zipEntries),
    fileName,
    assetCount: assetEntries.length,
  }
}

export async function exportProjectExchangeFile(
  payload: ProjectExchangePayload
): Promise<{ fileName: string; assetCount: number }> {
  const packageResult = await createProjectExchangePackageBlob(payload)
  triggerBrowserDownload(packageResult.fileName, packageResult.blob)

  return {
    fileName: packageResult.fileName,
    assetCount: packageResult.assetCount,
  }
}

export async function saveLocalDraft(payload: ProjectExchangePayload): Promise<void> {
  const storage = getLocalStorage()
  if (!storage) {
    return
  }

  const previousRawValue = getStoredDraftRawValue(storage)
  const previousLocalAssetUrls = readDraftLocalAssetUrls(previousRawValue)

  if (payload.nodes.length === 0 && payload.edges.length === 0) {
    clearStoredDraftKeys(storage)
    await removeLocalAssetUrls(previousLocalAssetUrls)
    return
  }

  const sanitizedPayload = sanitizePayload(payload)
  storage.setItem(LOCAL_DRAFT_STORAGE_KEY, serializeProjectExchange(sanitizedPayload))
  storage.removeItem(LEGACY_LOCAL_DRAFT_STORAGE_KEY_VALUE)

  try {
    const persistedPayload = await persistPayloadLocalAssets(sanitizedPayload)
    const nextSerialized = serializeProjectExchange(persistedPayload)
    const nextLocalAssetUrls = collectStoredLocalAssetUrls(persistedPayload.nodes)

    storage.setItem(LOCAL_DRAFT_STORAGE_KEY, nextSerialized)

    const nextLocalAssetSet = new Set(nextLocalAssetUrls)
    const removedAssetUrls = previousLocalAssetUrls.filter((url) => !nextLocalAssetSet.has(url))
    await removeLocalAssetUrls(removedAssetUrls)
  } catch (error) {
    console.warn('[projectExchange] failed to persist local draft assets, kept fast snapshot', error)
  }
}

export async function loadLocalDraft(): Promise<ProjectExchangePayload | null> {
  const storage = getLocalStorage()
  if (!storage) {
    return null
  }

  const rawValue = getStoredDraftRawValue(storage)
  if (!rawValue) {
    return null
  }

  try {
    const payload = parseProjectExchange(rawValue)
    const hydratedPayload = await hydratePayloadLocalAssets(payload)

    if (!storage.getItem(LOCAL_DRAFT_STORAGE_KEY)) {
      storage.setItem(LOCAL_DRAFT_STORAGE_KEY, serializeProjectExchange(payload))
      storage.removeItem(LEGACY_LOCAL_DRAFT_STORAGE_KEY_VALUE)
    }

    return hydratedPayload
  } catch (error) {
    console.warn('[projectExchange] failed to parse local draft', error)
    clearStoredDraftKeys(storage)
    return null
  }
}

export async function clearLocalDraft(): Promise<void> {
  const storage = getLocalStorage()
  if (!storage) {
    return
  }

  const rawValue = getStoredDraftRawValue(storage)
  const localAssetUrls = readDraftLocalAssetUrls(rawValue)

  clearStoredDraftKeys(storage)
  await removeLocalAssetUrls(localAssetUrls)
}
