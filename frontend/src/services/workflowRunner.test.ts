import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./nodeGeneration', () => ({
  executeImageGenNode: vi.fn(),
}))

vi.mock('./videoGeneration', () => ({
  executeVideoGenNode: vi.fn(),
}))

import type { AppEdge, AppNode } from '../types'
import { useFlowStore } from '../stores/useFlowStore'
import { executeImageGenNode } from './nodeGeneration'
import { executeVideoGenNode } from './videoGeneration'
import { executeWorkflow } from './workflowRunner'

const executeImageGenNodeMock = vi.mocked(executeImageGenNode)
const executeVideoGenNodeMock = vi.mocked(executeVideoGenNode)

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

describe('executeWorkflow', () => {
  beforeEach(() => {
    executeImageGenNodeMock.mockReset()
    executeVideoGenNodeMock.mockReset()
    useFlowStore.setState(createBaseState())
  })

  it('executes image nodes before downstream video nodes', async () => {
    const runOrder: string[] = []

    executeImageGenNodeMock.mockImplementation(async (nodeId: string) => {
      runOrder.push(`image:${nodeId}`)
    })

    executeVideoGenNodeMock.mockImplementation(async (nodeId: string) => {
      runOrder.push(`video:${nodeId}`)
    })

    const nodes: AppNode[] = [
      {
        id: 'upload-1',
        type: 'imageUpload',
        position: { x: 0, y: 0 },
        data: { label: 'Upload', imageUrl: '/uploads/ref.png' },
      } as AppNode,
      {
        id: 'image-1',
        type: 'imageGen',
        position: { x: 320, y: 0 },
        data: {
          label: 'Image',
          prompt: 'portrait',
          aspectRatio: '3:4',
          resolution: '2K',
          adapter: 'mock',
          upstreamReferenceImages: ['/uploads/ref.png'],
          manualReferenceImages: [],
          referenceImages: ['/uploads/ref.png'],
          isUploadingReferences: false,
          identityLock: false,
          identityStrength: 0.7,
          status: 'idle',
          progress: 0,
          creditCost: 30,
          resultCache: {},
          needsRefresh: false,
        },
      } as AppNode,
      {
        id: 'video-1',
        type: 'videoGen',
        position: { x: 640, y: 0 },
        data: {
          label: 'Video',
          prompt: 'motion',
          aspectRatio: '16:9',
          durationSeconds: 4,
          motionStrength: 0.6,
          adapter: 'mock',
          sourceImages: ['/outputs/image.png'],
          status: 'idle',
          progress: 0,
          creditCost: 90,
          resultCache: {},
          needsRefresh: false,
        },
      } as AppNode,
      {
        id: 'display-1',
        type: 'videoDisplay',
        position: { x: 960, y: 0 },
        data: { label: 'Display', videos: [], status: 'idle' },
      } as AppNode,
    ]

    const edges: AppEdge[] = [
      { id: 'e1', source: 'upload-1', target: 'image-1' } as AppEdge,
      { id: 'e2', source: 'image-1', target: 'video-1' } as AppEdge,
      { id: 'e3', source: 'video-1', target: 'display-1' } as AppEdge,
    ]

    useFlowStore.setState({
      ...createBaseState(),
      nodes,
      edges,
    })

    const result = await executeWorkflow()

    expect(runOrder).toEqual(['image:image-1', 'video:video-1'])
    expect(result.executedNodeIds).toEqual(['image-1', 'video-1'])
    expect(result.skippedNodeIds).toContain('upload-1')
    expect(result.skippedNodeIds).toContain('display-1')
    expect(useFlowStore.getState().isWorkflowExecuting).toBe(false)
  })

  it('skips disabled generation nodes', async () => {
    const nodes: AppNode[] = [
      {
        id: 'video-1',
        type: 'videoGen',
        position: { x: 0, y: 0 },
        data: {
          label: 'Video',
          prompt: 'motion',
          aspectRatio: '16:9',
          durationSeconds: 4,
          motionStrength: 0.6,
          adapter: 'mock',
          sourceImages: ['/outputs/image.png'],
          status: 'idle',
          progress: 0,
          creditCost: 90,
          resultCache: {},
          needsRefresh: false,
          disabled: true,
        },
      } as AppNode,
    ]

    useFlowStore.setState({
      ...createBaseState(),
      nodes,
      edges: [],
    })

    await expect(executeWorkflow()).rejects.toThrow('no executable generation nodes')
    expect(executeVideoGenNodeMock).not.toHaveBeenCalled()
  })
})
