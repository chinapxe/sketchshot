import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppEdge, AppNode, ImageUploadNodeData, ShotNodeData } from '../types'
import { readZipEntries } from './zip'
import {
  LOCAL_DRAFT_STORAGE_KEY,
  clearLocalDraft,
  createProjectExchangePackageBlob,
  loadLocalDraft,
  parseProjectExchange,
  readProjectExchangeData,
  saveLocalDraft,
  serializeProjectExchange,
} from './projectExchange'

function createMemoryStorage(): Storage {
  let store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },
    clear() {
      store = new Map<string, string>()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
  }
}

function createShotNode(status: ShotNodeData['status']): AppNode {
  return {
    id: 'shot-1',
    type: 'shot',
    position: { x: 120, y: 80 },
    data: {
      label: 'Shot',
      collapsed: false,
      title: 'Opening Shot',
      description: 'Scene setup',
      prompt: '',
      continuityFrames: Array.from({ length: 9 }, () => ''),
      shotSize: 'medium',
      cameraAngle: 'eye-level',
      motion: '',
      emotion: '',
      aspectRatio: '16:9',
      resolution: '2K',
      outputType: 'image',
      imageAdapter: 'volcengine',
      videoAdapter: 'volcengine',
      durationSeconds: 4,
      motionStrength: 0.6,
      identityLock: false,
      identityStrength: 0.7,
      referenceImages: [],
      status,
      progress: status === 'processing' ? 60 : 100,
      creditCost: 30,
      resultCache: {},
      needsRefresh: false,
    },
  } as AppNode
}

function createImageUploadNode(): AppNode {
  return {
    id: 'upload-1',
    type: 'imageUpload',
    position: { x: 0, y: 0 },
    data: {
      label: 'Image Upload',
      imageUrl: '/uploads/hero.png',
      fileName: 'hero.png',
      isUploading: false,
    } satisfies ImageUploadNodeData,
  } as AppNode
}

function createImageDisplayNode(imageUrl: string): AppNode {
  return {
    id: 'display-1',
    type: 'imageDisplay',
    position: { x: 200, y: 20 },
    data: {
      label: 'Image Output',
      images: [imageUrl],
      status: 'success',
    },
  } as AppNode
}

describe('projectExchange', () => {
  beforeEach(async () => {
    if (!('localStorage' in globalThis)) {
      Object.defineProperty(globalThis, 'localStorage', {
        value: createMemoryStorage(),
        configurable: true,
      })
    }

    globalThis.localStorage.clear()
    vi.restoreAllMocks()
    await clearLocalDraft()
  })

  it('serializes and parses workflow project files', () => {
    const payload = {
      workflowId: 'wf-1',
      name: 'Storyboard Project',
      nodes: [createShotNode('success')],
      edges: [{ id: 'edge-1', source: 'a', target: 'b' }] as AppEdge[],
    }

    const content = serializeProjectExchange(payload)
    const parsed = parseProjectExchange(content)

    expect(parsed.workflowId).toBe('wf-1')
    expect(parsed.name).toBe('Storyboard Project')
    expect(parsed.nodes).toHaveLength(1)
    expect(parsed.edges).toHaveLength(1)
  })

  it('resets running node state before persistence', () => {
    const payload = {
      workflowId: null,
      name: 'Draft',
      nodes: [createShotNode('processing')],
      edges: [] as AppEdge[],
    }

    const parsed = parseProjectExchange(serializeProjectExchange(payload))
    const shotData = parsed.nodes[0].data as ShotNodeData

    expect(shotData.status).toBe('idle')
    expect(shotData.progress).toBe(0)
  })

  it('saves and restores local drafts from localStorage', async () => {
    await saveLocalDraft({
      workflowId: null,
      name: 'Local Draft',
      nodes: [createShotNode('success')],
      edges: [] as AppEdge[],
    })

    expect(globalThis.localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)).toBeTruthy()

    const restored = await loadLocalDraft()
    expect(restored?.name).toBe('Local Draft')
    expect(restored?.nodes).toHaveLength(1)

    await clearLocalDraft()
    expect(globalThis.localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)).toBeNull()
  })

  it('persists blob assets inside local drafts so refresh can restore them', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : String(input)

      if (url === 'blob:temp-image') {
        return new Response(new Blob(['draft-image'], { type: 'image/png' }), { status: 200 })
      }

      return new Response('not found', { status: 404 })
    })

    let objectUrlIndex = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(
      () => `blob:restored-${++objectUrlIndex}`
    )

    await saveLocalDraft({
      workflowId: null,
      name: 'Draft With Local Asset',
      nodes: [createImageDisplayNode('blob:temp-image')],
      edges: [] as AppEdge[],
    })

    const storedContent = globalThis.localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)
    expect(storedContent).toContain('local-asset://')

    const restored = await loadLocalDraft()
    const restoredNode = restored?.nodes[0]

    expect(restored?.name).toBe('Draft With Local Asset')
    expect((restoredNode?.data as { images: string[] }).images).toEqual(['blob:restored-1'])
  })

  it('creates and restores zip project packages with bundled assets', async () => {
    const uploadNode = createImageUploadNode()
    const shotNode = createShotNode('success')
    const shotData = shotNode.data as ShotNodeData
    shotData.referenceImages = ['/uploads/hero.png']
    shotData.outputImage = '/outputs/shot.png'
    shotData.resultCache = {
      current: '/outputs/shot.png',
    }

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : String(input)

      if (url === '/uploads/hero.png') {
        return new Response(new Blob(['hero-image'], { type: 'image/png' }), { status: 200 })
      }

      if (url === '/outputs/shot.png') {
        return new Response(new Blob(['shot-image'], { type: 'image/png' }), { status: 200 })
      }

      return new Response('not found', { status: 404 })
    })

    let objectUrlIndex = 0
    vi.spyOn(URL, 'createObjectURL').mockImplementation(
      () => `blob:imported-${++objectUrlIndex}`
    )

    const packageResult = await createProjectExchangePackageBlob({
      workflowId: 'wf-zip',
      name: 'Zip Project',
      nodes: [uploadNode, shotNode],
      edges: [{ id: 'edge-1', source: 'upload-1', target: 'shot-1' }] as AppEdge[],
    })

    expect(packageResult.fileName).toBe('Zip-Project.wxhb.zip')
    expect(packageResult.assetCount).toBe(2)

    const packageBytes = new Uint8Array(await packageResult.blob.arrayBuffer())
    const zipEntries = readZipEntries(packageBytes)

    expect(zipEntries.some((entry) => entry.name === 'project.wxhb.json')).toBe(true)
    expect(zipEntries.filter((entry) => entry.name.startsWith('assets/'))).toHaveLength(2)

    const restored = readProjectExchangeData(packageBytes)
    const restoredUpload = restored.nodes.find((node) => node.id === 'upload-1')
    const restoredShot = restored.nodes.find((node) => node.id === 'shot-1')

    expect(restored.workflowId).toBe('wf-zip')
    expect(restored.name).toBe('Zip Project')
    expect(restored.edges).toHaveLength(1)
    expect((restoredUpload?.data as ImageUploadNodeData).imageUrl).toBe('blob:imported-1')
    expect((restoredShot?.data as ShotNodeData).referenceImages).toEqual(['blob:imported-1'])
    expect((restoredShot?.data as ShotNodeData).outputImage).toBe('blob:imported-2')
    expect((restoredShot?.data as ShotNodeData).resultCache).toEqual({ current: 'blob:imported-2' })
  })
})
