import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildVideoGenerationSignature } from '../utils/generationSignature'
import type { AppEdge, AppNode, ImageGenNodeData, VideoGenNodeData } from '../types'
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
})
