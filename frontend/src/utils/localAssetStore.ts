const LOCAL_ASSET_DB_NAME = 'wxhb-local-assets'
const LOCAL_ASSET_DB_VERSION = 1
const LOCAL_ASSET_STORE_NAME = 'assets'

export const LOCAL_ASSET_URL_PREFIX = 'local-asset://'

const memoryAssetStore = new Map<string, Blob>()
const runtimeObjectUrlCache = new Map<string, string>()

let databasePromise: Promise<IDBDatabase | null> | null = null

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined'
}

function createAssetId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `asset-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function splitUrlSuffix(url: string): { baseUrl: string; suffix: string } {
  const hashIndex = url.indexOf('#')
  if (hashIndex < 0) {
    return {
      baseUrl: url,
      suffix: '',
    }
  }

  return {
    baseUrl: url.slice(0, hashIndex),
    suffix: url.slice(hashIndex),
  }
}

function buildLocalAssetUrl(assetId: string, suffix = ''): string {
  return `${LOCAL_ASSET_URL_PREFIX}${assetId}${suffix}`
}

function parseLocalAssetUrl(url: string): { assetId: string; suffix: string } | null {
  if (!url.startsWith(LOCAL_ASSET_URL_PREFIX)) {
    return null
  }

  const { baseUrl, suffix } = splitUrlSuffix(url)
  const assetId = baseUrl.slice(LOCAL_ASSET_URL_PREFIX.length)

  if (!assetId) {
    return null
  }

  return {
    assetId,
    suffix,
  }
}

function toPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) {
    return null
  }

  if (!databasePromise) {
    databasePromise = new Promise((resolve) => {
      const request = indexedDB.open(LOCAL_ASSET_DB_NAME, LOCAL_ASSET_DB_VERSION)

      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(LOCAL_ASSET_STORE_NAME)) {
          database.createObjectStore(LOCAL_ASSET_STORE_NAME)
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        console.warn('[localAssetStore] failed to open indexedDB, fallback to memory store', request.error)
        resolve(null)
      }
    })
  }

  return databasePromise
}

async function putBlob(assetId: string, blob: Blob): Promise<void> {
  const database = await openDatabase()

  if (!database) {
    memoryAssetStore.set(assetId, blob)
    return
  }

  const transaction = database.transaction(LOCAL_ASSET_STORE_NAME, 'readwrite')
  const store = transaction.objectStore(LOCAL_ASSET_STORE_NAME)
  await toPromise(store.put(blob, assetId))
}

async function getBlob(assetId: string): Promise<Blob | null> {
  const database = await openDatabase()

  if (!database) {
    return memoryAssetStore.get(assetId) ?? null
  }

  const transaction = database.transaction(LOCAL_ASSET_STORE_NAME, 'readonly')
  const store = transaction.objectStore(LOCAL_ASSET_STORE_NAME)
  const result = await toPromise(store.get(assetId))
  return result instanceof Blob ? result : null
}

async function deleteBlob(assetId: string): Promise<void> {
  const cachedObjectUrl = runtimeObjectUrlCache.get(assetId)
  if (cachedObjectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(cachedObjectUrl)
  }
  runtimeObjectUrlCache.delete(assetId)

  const database = await openDatabase()

  if (!database) {
    memoryAssetStore.delete(assetId)
    return
  }

  const transaction = database.transaction(LOCAL_ASSET_STORE_NAME, 'readwrite')
  const store = transaction.objectStore(LOCAL_ASSET_STORE_NAME)
  await toPromise(store.delete(assetId))
}

export function isLocalAssetUrl(url: string): boolean {
  return url.startsWith(LOCAL_ASSET_URL_PREFIX)
}

export async function persistBrowserAssetUrl(url: string): Promise<string> {
  if (isLocalAssetUrl(url)) {
    return url
  }

  if (!url.startsWith('blob:')) {
    return url
  }

  const { baseUrl, suffix } = splitUrlSuffix(url)
  const response = await fetch(baseUrl)

  if (!response.ok) {
    throw new Error(`Failed to persist local asset: ${response.status}`)
  }

  const blob = await response.blob()
  const assetId = createAssetId()
  await putBlob(assetId, blob)

  return buildLocalAssetUrl(assetId, suffix)
}

export async function resolveBrowserAssetUrl(url: string): Promise<string> {
  const parsed = parseLocalAssetUrl(url)
  if (!parsed) {
    return url
  }

  const cachedObjectUrl = runtimeObjectUrlCache.get(parsed.assetId)
  if (cachedObjectUrl) {
    return `${cachedObjectUrl}${parsed.suffix}`
  }

  const blob = await getBlob(parsed.assetId)
  if (!blob) {
    return url
  }

  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return url
  }

  const objectUrl = URL.createObjectURL(blob)
  runtimeObjectUrlCache.set(parsed.assetId, objectUrl)
  return `${objectUrl}${parsed.suffix}`
}

export async function getStoredAssetBlob(url: string): Promise<Blob | null> {
  const parsed = parseLocalAssetUrl(url)
  if (!parsed) {
    return null
  }

  return getBlob(parsed.assetId)
}

export async function removeLocalAssetUrls(urls: string[]): Promise<void> {
  const uniqueIds = Array.from(
    new Set(
      urls
        .map((url) => parseLocalAssetUrl(url)?.assetId)
        .filter((assetId): assetId is string => typeof assetId === 'string' && assetId.length > 0)
    )
  )

  for (const assetId of uniqueIds) {
    await deleteBlob(assetId)
  }
}
