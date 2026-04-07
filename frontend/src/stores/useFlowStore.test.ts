import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildShotGenerationSignature,
  buildThreeViewGenerationSignature,
  buildVideoGenerationSignature,
} from '../utils/generationSignature'
import type {
  AppEdge,
  AppNode,
  ImageGenNodeData,
  ShotNodeData,
  ThreeViewGenNodeData,
  VideoGenNodeData,
} from '../types'
import { CHARACTER_THREE_VIEW_TARGET_HANDLE_IDS, THREE_VIEW_SLOT_HANDLE_IDS } from '../utils/threeView'
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

  it('syncs continuity preview images into downstream video and image display nodes', async () => {
    const nodes: AppNode[] = [
      {
        id: 'continuity-1',
        type: 'continuity',
        position: { x: 120, y: 80 },
        data: {
          label: '九宫格动作',
          collapsed: false,
          prompt: '角色连续冲刺后停住回望',
          frames: ['冲刺', '逼近', '减速', '', '停住', '', '回肩', '回头', '定格'],
          aspectRatio: '1:1',
          resolution: '2K',
          adapter: 'volcengine',
          contextSignature: 'continuity-ctx',
          status: 'success',
          progress: 100,
          creditCost: 30,
          outputImage: '/outputs/continuity-grid.png',
          resultCache: {},
          needsRefresh: false,
        },
      } as AppNode,
      {
        id: 'video-1',
        type: 'videoGen',
        position: { x: 420, y: 80 },
        data: {
          label: 'Video Motion',
          prompt: '让角色动作延续',
          aspectRatio: '16:9',
          durationSeconds: 4,
          motionStrength: 0.6,
          adapter: 'volcengine',
          sourceImages: [],
          status: 'idle',
          progress: 0,
          creditCost: 90,
          resultCache: {},
          needsRefresh: false,
        },
      } as AppNode,
      {
        id: 'display-1',
        type: 'imageDisplay',
        position: { x: 420, y: 240 },
        data: {
          label: 'Image Display',
          images: [],
          status: 'idle',
        },
      } as AppNode,
    ]

    const edges: AppEdge[] = [
      { id: 'edge-grid-video', source: 'continuity-1', target: 'video-1' } as AppEdge,
      { id: 'edge-grid-display', source: 'continuity-1', target: 'display-1' } as AppEdge,
    ]

    useFlowStore.setState({
      ...createBaseState(),
      nodes,
      edges,
    })

    useFlowStore.getState().syncDownstream('continuity-1')
    await flushTimers()

    const state = useFlowStore.getState()
    const videoNode = state.nodes.find((node) => node.id === 'video-1')
    const displayNode = state.nodes.find((node) => node.id === 'display-1')

    expect((videoNode?.data as VideoGenNodeData).sourceImages).toEqual(['/outputs/continuity-grid.png'])
    expect((displayNode?.data as { images: string[] }).images).toEqual(['/outputs/continuity-grid.png'])
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

  it('defaults new three-view generation nodes to the Volcengine adapter', () => {
    useFlowStore.getState().addNode('threeViewGen', { x: 120, y: 80 })

    const threeViewNode = useFlowStore.getState().nodes[0]
    expect(threeViewNode?.type).toBe('threeViewGen')
    expect((threeViewNode?.data as ThreeViewGenNodeData).adapter).toBe('volcengine')
    expect((threeViewNode?.data as ThreeViewGenNodeData).aspectRatio).toBe('16:9')
    expect((threeViewNode?.data as ThreeViewGenNodeData).outputMode).toBe('sheet')
  })

  it('creates preset image generation nodes with custom labels and normalized defaults', () => {
    useFlowStore.getState().addNode('imageGen', { x: 120, y: 80 }, {
      label: '主角定妆图',
      prompt: '电影感肖像',
      aspectRatio: '3:4',
    })

    const imageNode = useFlowStore.getState().nodes[0]
    expect(imageNode?.type).toBe('imageGen')
    expect((imageNode?.data as ImageGenNodeData).label).toBe('主角定妆图')
    expect((imageNode?.data as ImageGenNodeData).aspectRatio).toBe('3:4')
    expect((imageNode?.data as ImageGenNodeData).adapter).toBe('volcengine')
    expect((imageNode?.data as ImageGenNodeData).referenceImages).toEqual([])
  })

  it('defaults new storyboard shot nodes to image output with storyboard credit cost', () => {
    useFlowStore.getState().addNode('shot', { x: 120, y: 80 })

    const shotNode = useFlowStore.getState().nodes[0]
    expect(shotNode?.type).toBe('shot')
    expect((shotNode?.data as ShotNodeData).outputType).toBe('image')
    expect((shotNode?.data as ShotNodeData).imageAdapter).toBe('volcengine')
    expect((shotNode?.data as ShotNodeData).creditCost).toBe(30)
    expect((shotNode?.data as ShotNodeData).collapsed).toBe(false)
  })

  it('toggles collapsed state for storyboard nodes', () => {
    useFlowStore.getState().addNode('shot', { x: 120, y: 80 })

    const shotNode = useFlowStore.getState().nodes[0]
    expect(shotNode?.type).toBe('shot')

    useFlowStore.getState().toggleNodeCollapsed(shotNode.id)
    expect((useFlowStore.getState().nodes[0].data as ShotNodeData).collapsed).toBe(true)

    useFlowStore.getState().toggleNodeCollapsed(shotNode.id)
    expect((useFlowStore.getState().nodes[0].data as ShotNodeData).collapsed).toBe(false)
  })

  it('stores manual node width for resized nodes', () => {
    useFlowStore.getState().addNode('imageGen', { x: 120, y: 80 })

    const imageNode = useFlowStore.getState().nodes[0]
    expect(imageNode?.type).toBe('imageGen')

    useFlowStore.getState().updateNodeWidth(imageNode.id, 460)

    const updatedNode = useFlowStore.getState().nodes[0]
    expect((updatedNode.data as Record<string, unknown>).nodeWidth).toBe(460)
  })

  it('selects a single target node and clears other selections', () => {
    useFlowStore.setState({
      ...createBaseState(),
      nodes: [
        {
          id: 'continuity-1',
          type: 'continuity',
          position: { x: 0, y: 0 },
          selected: false,
          data: {
            label: '九宫格动作',
            collapsed: false,
            prompt: '',
            frames: Array.from({ length: 9 }, () => ''),
          },
        } as AppNode,
        {
          id: 'shot-1',
          type: 'shot',
          position: { x: 240, y: 0 },
          selected: true,
          data: {
            label: '镜头',
            title: '',
            description: '',
            prompt: '',
            continuityFrames: Array.from({ length: 9 }, () => ''),
            shotSize: 'medium',
            cameraAngle: 'eye-level',
            motion: '',
            emotion: '',
            aspectRatio: '16:9',
            resolution: '2K',
            outputType: 'video',
            imageAdapter: 'volcengine',
            videoAdapter: 'volcengine',
            durationSeconds: 4,
            motionStrength: 0.6,
            identityLock: false,
            identityStrength: 1,
            referenceImages: [],
            status: 'idle',
            progress: 0,
            creditCost: 90,
            resultCache: {},
            needsRefresh: false,
          },
        } as AppNode,
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'continuity-1',
          target: 'shot-1',
          selected: true,
        } as AppEdge,
      ],
    })

    useFlowStore.getState().selectNode('continuity-1')

    const state = useFlowStore.getState()
    expect(state.nodes.find((node) => node.id === 'continuity-1')?.selected).toBe(true)
    expect(state.nodes.find((node) => node.id === 'shot-1')?.selected).toBe(false)
    expect(state.edges.every((edge) => edge.selected !== true)).toBe(true)
  })

  it('selects a single edge and clears node selections', () => {
    useFlowStore.setState({
      ...createBaseState(),
      nodes: [
        {
          id: 'continuity-1',
          type: 'continuity',
          position: { x: 0, y: 0 },
          selected: true,
          data: {
            label: '九宫格动作',
            collapsed: false,
            prompt: '',
            frames: Array.from({ length: 9 }, () => ''),
          },
        } as AppNode,
        {
          id: 'shot-1',
          type: 'shot',
          position: { x: 240, y: 0 },
          selected: false,
          data: {
            label: '镜头',
            title: '',
            description: '',
            prompt: '',
            continuityFrames: Array.from({ length: 9 }, () => ''),
            shotSize: 'medium',
            cameraAngle: 'eye-level',
            motion: '',
            emotion: '',
            aspectRatio: '16:9',
            resolution: '2K',
            outputType: 'video',
            imageAdapter: 'volcengine',
            videoAdapter: 'volcengine',
            durationSeconds: 4,
            motionStrength: 0.6,
            identityLock: false,
            identityStrength: 1,
            referenceImages: [],
            status: 'idle',
            progress: 0,
            creditCost: 90,
            resultCache: {},
            needsRefresh: false,
          },
        } as AppNode,
      ],
      edges: [
        {
          id: 'edge-1',
          source: 'continuity-1',
          target: 'shot-1',
          selected: false,
        } as AppEdge,
        {
          id: 'edge-2',
          source: 'shot-1',
          target: 'continuity-1',
          selected: true,
        } as AppEdge,
      ],
    })

    useFlowStore.getState().selectEdge('edge-1')

    const state = useFlowStore.getState()
    expect(state.nodes.every((node) => node.selected !== true)).toBe(true)
    expect(state.edges.find((edge) => edge.id === 'edge-1')?.selected).toBe(true)
    expect(state.edges.find((edge) => edge.id === 'edge-2')?.selected).toBe(false)
  })

  it('deletes a single edge and resyncs target node inputs', async () => {
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
            appearance: '',
            wardrobe: '',
            props: '',
            notes: '',
            referenceImages: [],
            threeViewImages: {},
          },
        } as AppNode,
      ],
      edges: [
        {
          id: 'edge-upload-character',
          source: 'upload-1',
          target: 'character-1',
        } as AppEdge,
      ],
    })

    useFlowStore.getState().syncDownstream('upload-1')
    await flushTimers()
    await flushTimers()

    useFlowStore.getState().deleteEdge('edge-upload-character')
    await flushTimers()
    await flushTimers()

    const state = useFlowStore.getState()
    expect(state.edges).toHaveLength(0)

    const characterNode = state.nodes.find((node) => node.id === 'character-1')
    expect(characterNode?.type).toBe('character')
    if (!characterNode || characterNode.type !== 'character') {
      throw new Error('character node not found')
    }

    expect(characterNode.data.referenceImages).toEqual([])
    expect(characterNode.data.threeViewImages).toEqual({})
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

  it('syncs three-view sheet into character nodes without polluting reference images', async () => {
    const threeViewData: ThreeViewGenNodeData = {
      label: '三视图',
      prompt: '角色设定板',
      aspectRatio: '16:9',
      resolution: '2K',
      adapter: 'mock',
      referenceImages: ['/uploads/hero.png'],
      status: 'success',
      progress: 100,
      creditCost: 30,
      outputImage: '/outputs/hero-three-view.png',
      resultCache: {},
      needsRefresh: false,
      lastRunSignature: buildThreeViewGenerationSignature({
        prompt: '角色设定板',
        aspectRatio: '16:9',
        resolution: '2K',
        adapter: 'mock',
        referenceImages: ['/uploads/hero.png'],
      } as ThreeViewGenNodeData),
    }

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
          },
        } as AppNode,
        {
          id: 'three-view-1',
          type: 'threeViewGen',
          position: { x: 240, y: 0 },
          data: threeViewData,
        } as AppNode,
        {
          id: 'character-1',
          type: 'character',
          position: { x: 520, y: 0 },
          data: {
            label: 'Character',
            name: 'Hero',
            role: 'Lead',
            appearance: '',
            wardrobe: '',
            props: '',
            notes: '',
            referenceImages: [],
            threeViewImages: {},
          },
        } as AppNode,
      ],
      edges: [
        { id: 'edge-upload-character', source: 'upload-1', target: 'character-1' } as AppEdge,
        { id: 'edge-sheet-character', source: 'three-view-1', target: 'character-1' } as AppEdge,
      ],
    })

    useFlowStore.getState().syncDownstream('upload-1')
    useFlowStore.getState().syncDownstream('three-view-1')
    await flushTimers()
    await flushTimers()

    const characterNode = useFlowStore.getState().nodes.find((node) => node.id === 'character-1')
    expect(characterNode?.type).toBe('character')
    if (!characterNode || characterNode.type !== 'character') {
      throw new Error('character node not found')
    }

    const characterData = characterNode.data
    expect(characterData.referenceImages).toEqual(['/uploads/hero.png'])
    expect(characterData.threeViewSheetImage).toBe('/outputs/hero-three-view.png')
    expect(characterData.threeViewImages.front).toBe('/uploads/hero.png')
  })

  it('syncs split three-view outputs into image displays and character generated slots', async () => {
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
          },
        } as AppNode,
        {
          id: 'three-view-1',
          type: 'threeViewGen',
          position: { x: 240, y: 0 },
          data: {
            label: 'Three View',
            prompt: 'hero split',
            aspectRatio: '16:9',
            resolution: '2K',
            adapter: 'mock',
            referenceImages: ['/uploads/hero.png'],
            outputMode: 'split',
            status: 'success',
            progress: 100,
            creditCost: 90,
            outputImages: {
              front: '/outputs/hero-front.png',
              side: '/outputs/hero-side.png',
              back: '/outputs/hero-back.png',
            },
            splitResultCache: {},
            needsRefresh: false,
            lastRunSignature: buildThreeViewGenerationSignature({
              prompt: 'hero split',
              aspectRatio: '16:9',
              resolution: '2K',
              adapter: 'mock',
              referenceImages: ['/uploads/hero.png'],
              outputMode: 'split',
            } as ThreeViewGenNodeData),
          },
        } as AppNode,
        {
          id: 'display-1',
          type: 'imageDisplay',
          position: { x: 520, y: 0 },
          data: {
            label: 'Display',
            images: [],
            status: 'idle',
          },
        } as AppNode,
        {
          id: 'character-1',
          type: 'character',
          position: { x: 520, y: 240 },
          data: {
            label: 'Character',
            name: 'Hero',
            role: 'Lead',
            appearance: '',
            wardrobe: '',
            props: '',
            notes: '',
            referenceImages: [],
            threeViewImages: {},
          },
        } as AppNode,
      ],
      edges: [
        { id: 'edge-upload-character', source: 'upload-1', target: 'character-1' } as AppEdge,
        { id: 'edge-threeview-display', source: 'three-view-1', target: 'display-1' } as AppEdge,
        { id: 'edge-threeview-character', source: 'three-view-1', target: 'character-1' } as AppEdge,
      ],
    })

    useFlowStore.getState().syncDownstream('upload-1')
    useFlowStore.getState().syncDownstream('three-view-1')
    await flushTimers()
    await flushTimers()

    const displayNode = useFlowStore.getState().nodes.find((node) => node.id === 'display-1')
    expect(displayNode?.type).toBe('imageDisplay')
    expect((displayNode?.data as { images: string[] }).images).toEqual([
      '/outputs/hero-front.png',
      '/outputs/hero-side.png',
      '/outputs/hero-back.png',
    ])

    const characterNode = useFlowStore.getState().nodes.find((node) => node.id === 'character-1')
    expect(characterNode?.type).toBe('character')
    if (!characterNode || characterNode.type !== 'character') {
      throw new Error('character node not found')
    }

    expect(characterNode.data.referenceImages).toEqual(['/uploads/hero.png'])
    expect(characterNode.data.threeViewSheetImage).toBeUndefined()
    expect(characterNode.data.generatedThreeViewImages).toEqual({
      front: '/outputs/hero-front.png',
      side: '/outputs/hero-side.png',
      back: '/outputs/hero-back.png',
    })
    expect(characterNode.data.threeViewImages).toEqual({
      front: '/outputs/hero-front.png',
      side: '/outputs/hero-side.png',
      back: '/outputs/hero-back.png',
    })
  })

  it('routes split three-view outputs to downstream displays by source handle', async () => {
    useFlowStore.setState({
      ...createBaseState(),
      nodes: [
        {
          id: 'three-view-1',
          type: 'threeViewGen',
          position: { x: 240, y: 0 },
          data: {
            label: 'Three View',
            prompt: 'hero split',
            aspectRatio: '16:9',
            resolution: '2K',
            adapter: 'mock',
            referenceImages: ['/uploads/hero.png'],
            outputMode: 'split',
            status: 'success',
            progress: 100,
            creditCost: 90,
            outputImages: {
              front: '/outputs/hero-front.png',
              side: '/outputs/hero-side.png',
              back: '/outputs/hero-back.png',
            },
            splitResultCache: {},
            needsRefresh: false,
            lastRunSignature: buildThreeViewGenerationSignature({
              prompt: 'hero split',
              aspectRatio: '16:9',
              resolution: '2K',
              adapter: 'mock',
              referenceImages: ['/uploads/hero.png'],
              outputMode: 'split',
            } as ThreeViewGenNodeData),
          },
        } as AppNode,
        {
          id: 'display-all',
          type: 'imageDisplay',
          position: { x: 520, y: 0 },
          data: {
            label: 'Display All',
            images: [],
            status: 'idle',
          },
        } as AppNode,
        {
          id: 'display-front',
          type: 'imageDisplay',
          position: { x: 520, y: 120 },
          data: {
            label: 'Display Front',
            images: [],
            status: 'idle',
          },
        } as AppNode,
        {
          id: 'display-side',
          type: 'imageDisplay',
          position: { x: 520, y: 240 },
          data: {
            label: 'Display Side',
            images: [],
            status: 'idle',
          },
        } as AppNode,
        {
          id: 'display-back',
          type: 'imageDisplay',
          position: { x: 520, y: 360 },
          data: {
            label: 'Display Back',
            images: [],
            status: 'idle',
          },
        } as AppNode,
      ],
      edges: [
        { id: 'edge-threeview-all', source: 'three-view-1', target: 'display-all' } as AppEdge,
        {
          id: 'edge-threeview-front',
          source: 'three-view-1',
          sourceHandle: THREE_VIEW_SLOT_HANDLE_IDS.front,
          target: 'display-front',
        } as AppEdge,
        {
          id: 'edge-threeview-side',
          source: 'three-view-1',
          sourceHandle: THREE_VIEW_SLOT_HANDLE_IDS.side,
          target: 'display-side',
        } as AppEdge,
        {
          id: 'edge-threeview-back',
          source: 'three-view-1',
          sourceHandle: THREE_VIEW_SLOT_HANDLE_IDS.back,
          target: 'display-back',
        } as AppEdge,
      ],
    })

    useFlowStore.getState().syncDownstream('three-view-1')
    await flushTimers()
    await flushTimers()

    const state = useFlowStore.getState()
    const displayAll = state.nodes.find((node) => node.id === 'display-all')
    const displayFront = state.nodes.find((node) => node.id === 'display-front')
    const displaySide = state.nodes.find((node) => node.id === 'display-side')
    const displayBack = state.nodes.find((node) => node.id === 'display-back')

    expect((displayAll?.data as { images: string[] }).images).toEqual([
      '/outputs/hero-front.png',
      '/outputs/hero-side.png',
      '/outputs/hero-back.png',
    ])
    expect((displayFront?.data as { images: string[] }).images).toEqual(['/outputs/hero-front.png'])
    expect((displaySide?.data as { images: string[] }).images).toEqual(['/outputs/hero-side.png'])
    expect((displayBack?.data as { images: string[] }).images).toEqual(['/outputs/hero-back.png'])
  })

  it('adopts split three-view handle output into character three-view slots', async () => {
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
          },
        } as AppNode,
        {
          id: 'three-view-1',
          type: 'threeViewGen',
          position: { x: 240, y: 0 },
          data: {
            label: 'Three View',
            prompt: 'hero split',
            aspectRatio: '16:9',
            resolution: '2K',
            adapter: 'mock',
            referenceImages: ['/uploads/hero.png'],
            outputMode: 'split',
            status: 'success',
            progress: 100,
            creditCost: 90,
            outputImages: {
              front: '/outputs/hero-front.png',
              side: '/outputs/hero-side.png',
              back: '/outputs/hero-back.png',
            },
            splitResultCache: {},
            needsRefresh: false,
            lastRunSignature: buildThreeViewGenerationSignature({
              prompt: 'hero split',
              aspectRatio: '16:9',
              resolution: '2K',
              adapter: 'mock',
              referenceImages: ['/uploads/hero.png'],
              outputMode: 'split',
            } as ThreeViewGenNodeData),
          },
        } as AppNode,
        {
          id: 'character-1',
          type: 'character',
          position: { x: 520, y: 0 },
          data: {
            label: 'Character',
            name: 'Hero',
            role: 'Lead',
            appearance: '',
            wardrobe: '',
            props: '',
            notes: '',
            referenceImages: [],
            threeViewImages: {},
          },
        } as AppNode,
      ],
      edges: [
        { id: 'edge-upload-character', source: 'upload-1', target: 'character-1' } as AppEdge,
        {
          id: 'edge-threeview-front-character',
          source: 'three-view-1',
          sourceHandle: THREE_VIEW_SLOT_HANDLE_IDS.front,
          target: 'character-1',
          targetHandle: CHARACTER_THREE_VIEW_TARGET_HANDLE_IDS.front,
        } as AppEdge,
      ],
    })

    useFlowStore.getState().syncDownstream('upload-1')
    useFlowStore.getState().syncDownstream('three-view-1')
    await flushTimers()
    await flushTimers()

    const characterNode = useFlowStore.getState().nodes.find((node) => node.id === 'character-1')
    expect(characterNode?.type).toBe('character')
    if (!characterNode || characterNode.type !== 'character') {
      throw new Error('character node not found')
    }

    expect(characterNode.data.generatedThreeViewImages).toEqual({
      front: '/outputs/hero-front.png',
    })
    expect(characterNode.data.threeViewImages.front).toBe('/outputs/hero-front.png')
    expect(characterNode.data.threeViewImages.side).toBe('/uploads/hero.png')
    expect(characterNode.data.threeViewImages.back).toBeUndefined()
  })

  it('assigns uploaded references into explicit character three-view target handles', async () => {
    useFlowStore.setState({
      ...createBaseState(),
      nodes: [
        {
          id: 'upload-front',
          type: 'imageUpload',
          position: { x: 0, y: 0 },
          data: {
            label: 'Front Upload',
            imageUrl: '/uploads/front.png',
            fileName: 'front.png',
            isUploading: false,
          },
        } as AppNode,
        {
          id: 'upload-side',
          type: 'imageUpload',
          position: { x: 0, y: 120 },
          data: {
            label: 'Side Upload',
            imageUrl: '/uploads/side.png',
            fileName: 'side.png',
            isUploading: false,
          },
        } as AppNode,
        {
          id: 'character-1',
          type: 'character',
          position: { x: 520, y: 0 },
          data: {
            label: 'Character',
            name: 'Hero',
            role: 'Lead',
            appearance: '',
            wardrobe: '',
            props: '',
            notes: '',
            referenceImages: [],
            threeViewImages: {},
          },
        } as AppNode,
      ],
      edges: [
        {
          id: 'edge-upload-front-character',
          source: 'upload-front',
          target: 'character-1',
          targetHandle: CHARACTER_THREE_VIEW_TARGET_HANDLE_IDS.front,
        } as AppEdge,
        {
          id: 'edge-upload-side-character',
          source: 'upload-side',
          target: 'character-1',
          targetHandle: CHARACTER_THREE_VIEW_TARGET_HANDLE_IDS.side,
        } as AppEdge,
      ],
    })

    useFlowStore.getState().syncDownstream('upload-front')
    useFlowStore.getState().syncDownstream('upload-side')
    await flushTimers()
    await flushTimers()

    const characterNode = useFlowStore.getState().nodes.find((node) => node.id === 'character-1')
    expect(characterNode?.type).toBe('character')
    if (!characterNode || characterNode.type !== 'character') {
      throw new Error('character node not found')
    }

    expect(characterNode.data.referenceImages).toEqual(['/uploads/front.png', '/uploads/side.png'])
    expect(characterNode.data.threeViewImages).toEqual({
      front: '/uploads/front.png',
      side: '/uploads/side.png',
    })
  })
})
