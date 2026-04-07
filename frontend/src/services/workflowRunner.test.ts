import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./nodeGeneration', () => ({
  executeImageGenNode: vi.fn(),
}))

vi.mock('./continuityGeneration', () => ({
  executeContinuityNode: vi.fn(),
}))

vi.mock('./videoGeneration', () => ({
  executeVideoGenNode: vi.fn(),
}))

vi.mock('./storyboardGeneration', () => ({
  executeShotNode: vi.fn(),
}))

vi.mock('./threeViewGeneration', () => ({
  executeThreeViewGenNode: vi.fn(),
}))

import type { AppEdge, AppNode } from '../types'
import { useFlowStore } from '../stores/useFlowStore'
import { executeContinuityNode } from './continuityGeneration'
import { executeImageGenNode } from './nodeGeneration'
import { executeShotNode } from './storyboardGeneration'
import { executeThreeViewGenNode } from './threeViewGeneration'
import { executeVideoGenNode } from './videoGeneration'
import { executeWorkflow } from './workflowRunner'

const executeContinuityNodeMock = vi.mocked(executeContinuityNode)
const executeImageGenNodeMock = vi.mocked(executeImageGenNode)
const executeShotNodeMock = vi.mocked(executeShotNode)
const executeThreeViewGenNodeMock = vi.mocked(executeThreeViewGenNode)
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
    executeContinuityNodeMock.mockReset()
    executeImageGenNodeMock.mockReset()
    executeShotNodeMock.mockReset()
    executeThreeViewGenNodeMock.mockReset()
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

    await expect(executeWorkflow()).rejects.toThrow('当前工作流中没有可执行的生成节点')
    expect(executeVideoGenNodeMock).not.toHaveBeenCalled()
  })

  it('executes storyboard shot nodes in topological order', async () => {
    const runOrder: string[] = []

    executeShotNodeMock.mockImplementation(async (nodeId: string) => {
      runOrder.push(`shot:${nodeId}`)
    })

    const nodes: AppNode[] = [
      {
        id: 'scene-1',
        type: 'scene',
        position: { x: 0, y: 0 },
        data: {
          label: 'Scene',
          title: 'Rooftop',
          synopsis: 'Conflict peaks',
          beat: 'Decision made',
          notes: '',
        },
      } as AppNode,
      {
        id: 'shot-1',
        type: 'shot',
        position: { x: 320, y: 0 },
        data: {
          label: 'Shot',
          title: 'Hero close up',
          description: 'Hero turns back in rain',
          prompt: '',
          continuityFrames: Array.from({ length: 9 }, () => ''),
          shotSize: 'close-up',
          cameraAngle: 'eye-level',
          motion: '',
          emotion: 'tense',
          aspectRatio: '16:9',
          resolution: '2K',
          outputType: 'image',
          imageAdapter: 'mock',
          videoAdapter: 'mock',
          durationSeconds: 4,
          motionStrength: 0.6,
          identityLock: false,
          identityStrength: 0.7,
          referenceImages: [],
          contextSignature: '',
          status: 'idle',
          progress: 0,
          creditCost: 30,
          resultCache: {},
          needsRefresh: false,
        },
      } as AppNode,
      {
        id: 'shot-2',
        type: 'shot',
        position: { x: 640, y: 0 },
        data: {
          label: 'Shot',
          title: 'Reaction shot',
          description: 'The rival stares back',
          prompt: '',
          continuityFrames: Array.from({ length: 9 }, () => ''),
          shotSize: 'medium',
          cameraAngle: 'eye-level',
          motion: '',
          emotion: 'cold',
          aspectRatio: '16:9',
          resolution: '2K',
          outputType: 'image',
          imageAdapter: 'mock',
          videoAdapter: 'mock',
          durationSeconds: 4,
          motionStrength: 0.6,
          identityLock: false,
          identityStrength: 0.7,
          referenceImages: [],
          contextSignature: '',
          status: 'idle',
          progress: 0,
          creditCost: 30,
          resultCache: {},
          needsRefresh: false,
        },
      } as AppNode,
    ]

    const edges: AppEdge[] = [
      { id: 'scene-shot', source: 'scene-1', target: 'shot-1' } as AppEdge,
      { id: 'shot-shot', source: 'shot-1', target: 'shot-2' } as AppEdge,
    ]

    useFlowStore.setState({
      ...createBaseState(),
      nodes,
      edges,
    })

    const result = await executeWorkflow()

    expect(runOrder).toEqual(['shot:shot-1', 'shot:shot-2'])
    expect(result.executedNodeIds).toEqual(['shot-1', 'shot-2'])
    expect(result.skippedNodeIds).toContain('scene-1')
  })

  it('executes continuity preview nodes before downstream video nodes', async () => {
    const runOrder: string[] = []

    executeContinuityNodeMock.mockImplementation(async (nodeId: string) => {
      runOrder.push(`continuity:${nodeId}`)
    })

    executeVideoGenNodeMock.mockImplementation(async (nodeId: string) => {
      runOrder.push(`video:${nodeId}`)
    })

    const nodes: AppNode[] = [
      {
        id: 'continuity-1',
        type: 'continuity',
        position: { x: 0, y: 0 },
        data: {
          label: '九宫格动作',
          collapsed: false,
          prompt: '角色先冲入画面，再减速观察，最后回头定住视线。',
          frames: ['冲入', '逼近', '减速', '停顿', '回头', '', '', '', '定住'],
          aspectRatio: '1:1',
          resolution: '2K',
          adapter: 'volcengine',
          contextSignature: 'ctx-1',
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
        position: { x: 320, y: 0 },
        data: {
          label: 'Video',
          prompt: '根据九宫格推进角色动作',
          aspectRatio: '16:9',
          durationSeconds: 4,
          motionStrength: 0.6,
          adapter: 'mock',
          sourceImages: ['/outputs/grid.png'],
          status: 'idle',
          progress: 0,
          creditCost: 90,
          resultCache: {},
          needsRefresh: false,
        },
      } as AppNode,
    ]

    const edges: AppEdge[] = [
      { id: 'grid-video', source: 'continuity-1', target: 'video-1' } as AppEdge,
    ]

    useFlowStore.setState({
      ...createBaseState(),
      nodes,
      edges,
    })

    const result = await executeWorkflow()

    expect(runOrder).toEqual(['continuity:continuity-1', 'video:video-1'])
    expect(result.executedNodeIds).toEqual(['continuity-1', 'video-1'])
  })

  it('executes three-view nodes before downstream image nodes', async () => {
    const runOrder: string[] = []

    executeThreeViewGenNodeMock.mockImplementation(async (nodeId: string) => {
      runOrder.push(`three-view:${nodeId}`)
    })

    executeImageGenNodeMock.mockImplementation(async (nodeId: string) => {
      runOrder.push(`image:${nodeId}`)
    })

    const nodes: AppNode[] = [
      {
        id: 'upload-1',
        type: 'imageUpload',
        position: { x: 0, y: 0 },
        data: {
          label: 'Upload',
          imageUrl: '/uploads/hero.png',
          fileName: 'hero.png',
        },
      } as AppNode,
      {
        id: 'three-view-1',
        type: 'threeViewGen',
        position: { x: 320, y: 0 },
        data: {
          label: '三视图',
          prompt: '',
          aspectRatio: '16:9',
          resolution: '2K',
          adapter: 'mock',
          referenceImages: ['/uploads/hero.png'],
          status: 'idle',
          progress: 0,
          creditCost: 30,
          resultCache: {},
          needsRefresh: false,
        },
      } as AppNode,
      {
        id: 'image-1',
        type: 'imageGen',
        position: { x: 640, y: 0 },
        data: {
          label: 'Image',
          prompt: 'poster',
          aspectRatio: '3:4',
          resolution: '2K',
          adapter: 'mock',
          upstreamReferenceImages: ['/outputs/three-view.png'],
          manualReferenceImages: [],
          referenceImages: ['/outputs/three-view.png'],
          isUploadingReferences: false,
          identityLock: false,
          identityStrength: 1,
          status: 'idle',
          progress: 0,
          creditCost: 30,
          resultCache: {},
          needsRefresh: false,
        },
      } as AppNode,
    ]

    const edges: AppEdge[] = [
      { id: 'edge-upload-sheet', source: 'upload-1', target: 'three-view-1' } as AppEdge,
      { id: 'edge-sheet-image', source: 'three-view-1', target: 'image-1' } as AppEdge,
    ]

    useFlowStore.setState({
      ...createBaseState(),
      nodes,
      edges,
    })

    const result = await executeWorkflow()

    expect(runOrder).toEqual(['three-view:three-view-1', 'image:image-1'])
    expect(result.executedNodeIds).toEqual(['three-view-1', 'image-1'])
  })
})
