import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildShotGenerationSignature, buildVideoGenerationSignature } from '../utils/generationSignature'
import type { AppEdge, AppNode, ImageGenNodeData, ShotNodeData, VideoGenNodeData } from '../types'
import { useFlowStore } from './useFlowStore'

function createBaseState() {
  return {
    nodes: [],
    edges: [],
    currentWorkflowId: null,
    currentWorkflowName: 'Untitled Workflow',
    isWorkflowExecuting: false,
    activeExecutionNodeId: null,
    canUndo: false,
    canRedo: false,
    _history: [],
    _historyIndex: -1,
  }
}

function flushTimers(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('useFlowStore video workflow support', () => {
  beforeEach(() => {
    useFlowStore.setState(createBaseState())
  })

  afterEach(() => {
    useFlowStore.setState(createBaseState())
  })

  it('normalizes loaded video generation nodes and preserves project metadata', () => {
    const videoData: Partial<VideoGenNodeData> = {
      label: 'Video Motion',
      prompt: 'slow push in',
      aspectRatio: '16:9',
      durationSeconds: 4,
      motionStrength: 0.6,
      adapter: 'mock',
      sourceImages: ['/outputs/frame-a.png', '/outputs/frame-a.png', '/outputs/frame-b.png'],
      status: 'success',
      progress: 100,
      creditCost: 90,
      resultCache: {},
    }
    const signature = buildVideoGenerationSignature(videoData as VideoGenNodeData)

    useFlowStore.getState().loadWorkflow({
      id: 'wf-video-001',
      name: 'Video Pipeline',
      nodes: [
        {
          id: 'video-1',
          type: 'videoGen',
          position: { x: 320, y: 120 },
          data: {
            ...videoData,
            lastRunSignature: signature,
          },
        } as AppNode,
      ],
      edges: [],
    })

    const state = useFlowStore.getState()
    expect(state.currentWorkflowId).toBe('wf-video-001')
    expect(state.currentWorkflowName).toBe('Video Pipeline')

    const loadedNode = state.nodes[0]
    expect(loadedNode.type).toBe('videoGen')

    const loadedData = loadedNode.data as VideoGenNodeData
    expect(loadedData.sourceImages).toEqual(['/outputs/frame-a.png', '/outputs/frame-b.png'])
    expect(loadedData.needsRefresh).toBe(false)
    expect(state.canUndo).toBe(false)
    expect(state.canRedo).toBe(false)
  })

  it('syncs video output into downstream video display nodes', async () => {
    const nodes: AppNode[] = [
      {
        id: 'video-1',
        type: 'videoGen',
        position: { x: 240, y: 160 },
        data: {
          label: 'Motion',
          prompt: 'subtle motion',
          aspectRatio: '16:9',
          durationSeconds: 4,
          motionStrength: 0.5,
          adapter: 'mock',
          sourceImages: ['/outputs/frame.png'],
          status: 'success',
          progress: 100,
          creditCost: 90,
          outputVideo: '/outputs/clip.gif',
          resultCache: {},
          needsRefresh: false,
        },
      } as AppNode,
      {
        id: 'display-1',
        type: 'videoDisplay',
        position: { x: 560, y: 160 },
        data: {
          label: 'Video Output',
          videos: [],
          status: 'idle',
        },
      } as AppNode,
    ]

    const edges: AppEdge[] = [
      {
        id: 'edge-video-display',
        source: 'video-1',
        target: 'display-1',
      } as AppEdge,
    ]

    useFlowStore.setState({
      ...createBaseState(),
      nodes,
      edges,
    })

    useFlowStore.getState().syncDownstream('video-1')
    await flushTimers()

    const displayNode = useFlowStore.getState().nodes.find((node) => node.id === 'display-1')
    expect(displayNode?.type).toBe('videoDisplay')
    expect((displayNode?.data as { videos: string[] }).videos).toEqual(['/outputs/clip.gif'])
  })

  it('defaults new video generation nodes to the Volcengine adapter', () => {
    useFlowStore.getState().addNode('videoGen', { x: 120, y: 80 })

    const videoNode = useFlowStore.getState().nodes[0]
    expect(videoNode?.type).toBe('videoGen')
    expect((videoNode?.data as VideoGenNodeData).adapter).toBe('volcengine')
  })

  it('defaults new image generation nodes to the Volcengine adapter', () => {
    useFlowStore.getState().addNode('imageGen', { x: 120, y: 80 })

    const imageNode = useFlowStore.getState().nodes[0]
    expect(imageNode?.type).toBe('imageGen')
    expect((imageNode?.data as ImageGenNodeData).adapter).toBe('volcengine')
  })

  it('defaults new storyboard shot nodes to image output with storyboard credit cost', () => {
    useFlowStore.getState().addNode('shot', { x: 120, y: 80 })

    const shotNode = useFlowStore.getState().nodes[0]
    expect(shotNode?.type).toBe('shot')
    expect((shotNode?.data as ShotNodeData).outputType).toBe('image')
    expect((shotNode?.data as ShotNodeData).imageAdapter).toBe('volcengine')
    expect((shotNode?.data as ShotNodeData).creditCost).toBe(30)
  })

  it('syncs character references into downstream storyboard shots and marks refresh when context changes', async () => {
    const shotData: ShotNodeData = {
      label: 'Shot',
      title: 'Hero close up',
      description: 'Hero turns',
      prompt: '',
      continuityFrames: Array.from({ length: 9 }, () => ''),
      shotSize: 'close-up',
      cameraAngle: 'eye-level',
      motion: '',
      emotion: 'tense',
      aspectRatio: '16:9',
      resolution: '2K',
      outputType: 'image',
      imageAdapter: 'volcengine',
      videoAdapter: 'volcengine',
      durationSeconds: 4,
      motionStrength: 0.6,
      identityLock: false,
      identityStrength: 0.7,
      referenceImages: ['/uploads/hero.png'],
      contextSignature: 'before',
      status: 'success',
      progress: 100,
      creditCost: 30,
      outputImage: '/outputs/shot.png',
      resultCache: {},
      needsRefresh: false,
      errorMessage: undefined,
    }

    const signature = buildShotGenerationSignature(shotData)

    useFlowStore.setState({
      ...createBaseState(),
      nodes: [
        {
          id: 'upload-1',
          type: 'imageUpload',
          position: { x: 0, y: 0 },
          data: {
            label: 'Upload',
            imageUrl: '/uploads/hero.png',
            fileName: 'hero.png',
            isUploading: false,
            uploadError: undefined,
          },
        } as AppNode,
        {
          id: 'character-1',
          type: 'character',
          position: { x: 240, y: 0 },
          data: {
            label: 'Character',
            name: 'Hero',
            role: 'Lead',
            appearance: 'short hair',
            wardrobe: '',
            props: '',
            notes: '',
            referenceImages: [],
            threeViewImages: {},
          },
        } as AppNode,
        {
          id: 'shot-1',
          type: 'shot',
          position: { x: 480, y: 0 },
          data: {
            ...shotData,
            lastRunSignature: signature,
          },
        } as AppNode,
      ],
      edges: [
        { id: 'edge-1', source: 'upload-1', target: 'character-1' } as AppEdge,
        { id: 'edge-2', source: 'character-1', target: 'shot-1' } as AppEdge,
      ],
    })

    useFlowStore.getState().syncDownstream('upload-1')
    await flushTimers()
    await flushTimers()

    const characterNode = useFlowStore.getState().nodes.find((node) => node.id === 'character-1')
    expect(characterNode?.type).toBe('character')
    expect((characterNode?.data as { referenceImages: string[] }).referenceImages).toEqual(['/uploads/hero.png'])
    expect((characterNode?.data as { threeViewImages: { front?: string } }).threeViewImages.front).toBe('/uploads/hero.png')

    const shotNode = useFlowStore.getState().nodes.find((node) => node.id === 'shot-1')
    expect(shotNode?.type).toBe('shot')
    expect((shotNode?.data as ShotNodeData).referenceImages).toEqual(['/uploads/hero.png'])
    expect((shotNode?.data as ShotNodeData).needsRefresh).toBe(true)
  })
})
