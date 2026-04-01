import { create } from 'zustand'
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
} from '@xyflow/react'
import { v4 as uuidv4 } from 'uuid'

import type {
  AppEdge,
  AppNode,
  AppNodeType,
  ImageDisplayNodeData,
  ImageGenNodeData,
  ImageUploadNodeData,
  NodeStatus,
  VideoDisplayNodeData,
  VideoGenNodeData,
} from '../types'
import { buildGenerationSignature, buildVideoGenerationSignature } from '../utils/generationSignature'

const createDefaultNodeData = (type: AppNodeType): Record<string, unknown> => {
  switch (type) {
    case 'imageUpload':
      return {
        label: 'Image Upload',
        imageUrl: undefined,
        fileName: undefined,
        isUploading: false,
        uploadError: undefined,
      } satisfies ImageUploadNodeData
    case 'imageGen':
      return {
        label: 'Image Generate',
        prompt: '',
        aspectRatio: '1:1',
        resolution: '2K',
        adapter: 'volcengine',
        upstreamReferenceImages: [],
        manualReferenceImages: [],
        referenceImages: [],
        isUploadingReferences: false,
        referenceUploadError: undefined,
        identityLock: false,
        identityStrength: 0.7,
        status: 'idle' as NodeStatus,
        progress: 0,
        creditCost: 30,
        resultCache: {},
        needsRefresh: false,
      } satisfies ImageGenNodeData
    case 'imageDisplay':
      return {
        label: 'Image Output',
        images: [],
        status: 'idle' as NodeStatus,
      } satisfies ImageDisplayNodeData
    case 'videoGen':
      return {
        label: 'Video Motion',
        prompt: '',
        aspectRatio: '16:9',
        durationSeconds: 4,
        motionStrength: 0.6,
        adapter: 'volcengine',
        sourceImages: [],
        status: 'idle' as NodeStatus,
        progress: 0,
        creditCost: 90,
        resultCache: {},
        needsRefresh: false,
      } satisfies VideoGenNodeData
    case 'videoDisplay':
      return {
        label: 'Video Output',
        videos: [],
        status: 'idle' as NodeStatus,
      } satisfies VideoDisplayNodeData
    default:
      return { label: 'Unknown Node' }
  }
}

const cloneFlowState = (nodes: AppNode[], edges: AppEdge[]) => ({
  nodes: JSON.parse(JSON.stringify(nodes)) as AppNode[],
  edges: JSON.parse(JSON.stringify(edges)) as AppEdge[],
})

const AUTO_LAYOUT_START_X = 80
const AUTO_LAYOUT_START_Y = 80
const AUTO_LAYOUT_X_GAP = 340
const AUTO_LAYOUT_Y_GAP = 220

const dedupeStringList = (values: unknown): string[] => {
  if (!Array.isArray(values)) return []

  return Array.from(
    new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))
  )
}

const mergeStringLists = (...lists: unknown[]): string[] => dedupeStringList(lists.flat())

const normalizeImageGenData = (data: Partial<ImageGenNodeData>): ImageGenNodeData => {
  const legacyReferenceImages = dedupeStringList(data.referenceImages)
  const hasExplicitUpstreamReferences = Array.isArray(data.upstreamReferenceImages)
  const hasExplicitManualReferences = Array.isArray(data.manualReferenceImages)
  const upstreamReferenceImages = dedupeStringList(data.upstreamReferenceImages)
  const manualReferenceImages = hasExplicitManualReferences
    ? dedupeStringList(data.manualReferenceImages)
    : hasExplicitUpstreamReferences
      ? []
      : legacyReferenceImages
  const referenceImages = mergeStringLists(upstreamReferenceImages, manualReferenceImages)

  const restData = { ...data }
  delete restData.upstreamReferenceImages
  delete restData.manualReferenceImages
  delete restData.referenceImages
  delete restData.isUploadingReferences
  delete restData.referenceUploadError

  return {
    label: 'Image Generate',
    prompt: '',
    aspectRatio: '1:1',
    resolution: '2K',
    adapter: 'volcengine',
    upstreamReferenceImages,
    manualReferenceImages,
    referenceImages,
    isUploadingReferences: data.isUploadingReferences === true,
    referenceUploadError: typeof data.referenceUploadError === 'string' ? data.referenceUploadError : undefined,
    identityLock: false,
    identityStrength: 0.7,
    status: 'idle' as NodeStatus,
    progress: 0,
    creditCost: 30,
    resultCache: {},
    needsRefresh: false,
    ...restData,
  }
}

const normalizeVideoGenData = (data: Partial<VideoGenNodeData>): VideoGenNodeData => {
  const sourceImages = dedupeStringList(data.sourceImages)
  const restData = { ...data }
  delete restData.sourceImages

  return {
    label: 'Video Motion',
    prompt: '',
    aspectRatio: '16:9',
    durationSeconds: 4,
    motionStrength: 0.6,
    adapter: 'volcengine',
    sourceImages,
    status: 'idle' as NodeStatus,
    progress: 0,
    creditCost: 90,
    resultCache: {},
    needsRefresh: false,
    ...restData,
  }
}

const syncImageGenDerivedState = (data: Partial<ImageGenNodeData>): ImageGenNodeData => {
  const normalizedData = normalizeImageGenData(data)
  const isGenerating = normalizedData.status === 'queued' || normalizedData.status === 'processing'
  const hasRun = Boolean(normalizedData.lastRunSignature)
  const currentSignature = buildGenerationSignature(normalizedData)

  return {
    ...normalizedData,
    identityLock: normalizedData.identityLock && normalizedData.referenceImages.length > 0,
    needsRefresh: hasRun && !isGenerating && currentSignature !== normalizedData.lastRunSignature,
  }
}

const syncVideoGenDerivedState = (data: Partial<VideoGenNodeData>): VideoGenNodeData => {
  const normalizedData = normalizeVideoGenData(data)
  const isGenerating = normalizedData.status === 'queued' || normalizedData.status === 'processing'
  const hasRun = Boolean(normalizedData.lastRunSignature)
  const currentSignature = buildVideoGenerationSignature(normalizedData)

  return {
    ...normalizedData,
    needsRefresh: hasRun && !isGenerating && currentSignature !== normalizedData.lastRunSignature,
  }
}

const sortNodesByPosition = (a: AppNode, b: AppNode) => {
  if (a.position.y !== b.position.y) return a.position.y - b.position.y
  return a.position.x - b.position.x
}

const computeAutoLayoutNodes = (nodes: AppNode[], edges: AppEdge[]): AppNode[] => {
  if (nodes.length === 0) return []

  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]))
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]))

  edges.forEach((edge) => {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) return
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    outgoing.get(edge.source)?.push(edge.target)
    incoming.get(edge.target)?.push(edge.source)
  })

  const queue = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .sort(sortNodesByPosition)
    .map((node) => node.id)

  if (queue.length === 0) {
    queue.push(...nodes.sort(sortNodesByPosition).map((node) => node.id))
  }

  const levels = new Map<string, number>()
  const visited = new Set<string>()

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const parentIds = incoming.get(currentId) ?? []
    const level = parentIds.length === 0
      ? 0
      : Math.max(...parentIds.map((parentId) => levels.get(parentId) ?? 0)) + 1

    levels.set(currentId, level)

    ;(outgoing.get(currentId) ?? []).forEach((targetId) => {
      indegree.set(targetId, (indegree.get(targetId) ?? 1) - 1)
      if ((indegree.get(targetId) ?? 0) <= 0) {
        queue.push(targetId)
      }
    })
  }

  nodes
    .filter((node) => !levels.has(node.id))
    .sort(sortNodesByPosition)
    .forEach((node, index) => {
      levels.set(node.id, index)
    })

  const levelBuckets = new Map<number, AppNode[]>()
  nodes.forEach((node) => {
    const level = levels.get(node.id) ?? 0
    const bucket = levelBuckets.get(level) ?? []
    bucket.push(node)
    levelBuckets.set(level, bucket)
  })

  levelBuckets.forEach((bucket) => bucket.sort(sortNodesByPosition))

  return nodes.map((node) => {
    const level = levels.get(node.id) ?? 0
    const indexInLevel = levelBuckets.get(level)?.findIndex((item) => item.id === node.id) ?? 0

    return {
      ...node,
      selected: false,
      position: {
        x: AUTO_LAYOUT_START_X + level * AUTO_LAYOUT_X_GAP,
        y: AUTO_LAYOUT_START_Y + indexInLevel * AUTO_LAYOUT_Y_GAP,
      },
    }
  })
}

const isValidConnection = (connection: Connection, nodes: AppNode[]): boolean => {
  const sourceNode = nodes.find((node) => node.id === connection.source)
  const targetNode = nodes.find((node) => node.id === connection.target)
  if (!sourceNode || !targetNode) return false

  const validConnections: Record<string, string[]> = {
    imageUpload: ['imageGen', 'videoGen'],
    imageGen: ['imageDisplay', 'videoGen'],
    videoGen: ['videoDisplay'],
  }

  const allowedTargets = validConnections[sourceNode.type || '']
  return allowedTargets ? allowedTargets.includes(targetNode.type || '') : false
}

interface FlowState {
  nodes: AppNode[]
  edges: AppEdge[]
  currentWorkflowId: string | null
  currentWorkflowName: string
  isWorkflowExecuting: boolean
  activeExecutionNodeId: string | null
  onNodesChange: OnNodesChange<AppNode>
  onEdgesChange: OnEdgesChange
  onConnect: OnConnect
  addNode: (type: AppNodeType, position: { x: number; y: number }) => void
  updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void
  deleteNode: (nodeId: string) => void
  cloneNode: (nodeId: string) => void
  toggleNodeDisabled: (nodeId: string) => void
  getUpstreamImages: (nodeId: string) => string[]
  getUpstreamVideos: (nodeId: string) => string[]
  syncDownstream: (sourceNodeId: string) => void
  selectAll: () => void
  autoLayout: () => void
  clearCanvas: () => void
  setWorkflowMeta: (workflowId: string | null, workflowName: string) => void
  setWorkflowExecutionState: (isExecuting: boolean, activeNodeId?: string | null) => void
  loadWorkflow: (workflow: { id: string | null; name: string; nodes: AppNode[]; edges: AppEdge[] }) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  _history: Array<{ nodes: AppNode[]; edges: AppEdge[] }>
  _historyIndex: number
  _pushHistory: () => void
}

const MAX_HISTORY = 50

export const useFlowStore = create<FlowState>((set, get) => ({
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

  _pushHistory: () => {
    const { nodes, edges, _history, _historyIndex } = get()
    const newHistory = _history.slice(0, _historyIndex + 1)
    newHistory.push(cloneFlowState(nodes, edges))

    if (newHistory.length > MAX_HISTORY) {
      newHistory.shift()
    }

    set({
      _history: newHistory,
      _historyIndex: newHistory.length - 1,
      canUndo: newHistory.length > 1,
      canRedo: false,
    })
  },

  onNodesChange: (changes: NodeChange<AppNode>[]) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) })
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    set({ edges: applyEdgeChanges(changes, get().edges) })
  },

  onConnect: (connection: Connection) => {
    const { nodes, edges, _pushHistory, syncDownstream } = get()
    if (!isValidConnection(connection, nodes)) {
      console.warn('[flow] rejected invalid connection')
      return
    }

    _pushHistory()
    const newEdges = addEdge({ ...connection, type: 'smoothstep', animated: true }, edges)
    set({ edges: newEdges })

    if (connection.source) {
      setTimeout(() => syncDownstream(connection.source!), 0)
    }
  },

  addNode: (type: AppNodeType, position: { x: number; y: number }) => {
    get()._pushHistory()
    const newNode = {
      id: uuidv4(),
      type,
      position,
      data: createDefaultNodeData(type),
    } as AppNode

    set({ nodes: [...get().nodes, newNode] })
  },

  updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id !== nodeId) return node

        const mergedData = { ...node.data, ...data }

        if (node.type === 'imageGen') {
          return {
            ...node,
            data: syncImageGenDerivedState(mergedData as Partial<ImageGenNodeData>),
          } as AppNode
        }

        if (node.type === 'videoGen') {
          return {
            ...node,
            data: syncVideoGenDerivedState(mergedData as Partial<VideoGenNodeData>),
          } as AppNode
        }

        return { ...node, data: mergedData } as AppNode
      }),
    })

    setTimeout(() => get().syncDownstream(nodeId), 0)
  },

  deleteNode: (nodeId: string) => {
    get()._pushHistory()
    set({
      nodes: get().nodes.filter((node) => node.id !== nodeId),
      edges: get().edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    })
  },

  cloneNode: (nodeId: string) => {
    const sourceNode = get().nodes.find((node) => node.id === nodeId)
    if (!sourceNode) return

    get()._pushHistory()
    const clonedNode = {
      ...sourceNode,
      id: uuidv4(),
      position: {
        x: sourceNode.position.x + 40,
        y: sourceNode.position.y + 40,
      },
      data: JSON.parse(JSON.stringify(sourceNode.data)),
      selected: false,
    } as AppNode

    set({ nodes: [...get().nodes, clonedNode] })
  },

  toggleNodeDisabled: (nodeId: string) => {
    const node = get().nodes.find((item) => item.id === nodeId)
    if (!node) return

    get()._pushHistory()
    const isCurrentlyDisabled = (node.data as Record<string, unknown>).disabled === true
    set({
      nodes: get().nodes.map((item) =>
        item.id === nodeId
          ? ({ ...item, data: { ...item.data, disabled: !isCurrentlyDisabled } } as AppNode)
          : item
      ),
    })
  },

  getUpstreamImages: (nodeId: string): string[] => {
    const { nodes, edges } = get()
    const incomingEdges = edges.filter((edge) => edge.target === nodeId)
    const images: string[] = []

    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((node) => node.id === edge.source)
      if (!sourceNode) continue
      if ((sourceNode.data as Record<string, unknown>).disabled === true) continue

      if (sourceNode.type === 'imageUpload') {
        const data = sourceNode.data as ImageUploadNodeData
        if (data.imageUrl) images.push(data.imageUrl)
      } else if (sourceNode.type === 'imageGen') {
        const data = sourceNode.data as ImageGenNodeData
        if (data.outputImage) images.push(data.outputImage)
      }
    }

    return dedupeStringList(images)
  },

  getUpstreamVideos: (nodeId: string): string[] => {
    const { nodes, edges } = get()
    const incomingEdges = edges.filter((edge) => edge.target === nodeId)
    const videos: string[] = []

    for (const edge of incomingEdges) {
      const sourceNode = nodes.find((node) => node.id === edge.source)
      if (!sourceNode) continue
      if ((sourceNode.data as Record<string, unknown>).disabled === true) continue

      if (sourceNode.type === 'videoGen') {
        const data = sourceNode.data as VideoGenNodeData
        if (data.outputVideo) videos.push(data.outputVideo)
      }
    }

    return dedupeStringList(videos)
  },

  syncDownstream: (sourceNodeId: string) => {
    const { nodes, edges, updateNodeData, getUpstreamImages, getUpstreamVideos } = get()
    const downstreamEdges = edges.filter((edge) => edge.source === sourceNodeId)

    for (const edge of downstreamEdges) {
      const targetNode = nodes.find((node) => node.id === edge.target)
      if (!targetNode) continue

      if (targetNode.type === 'imageGen') {
        updateNodeData(edge.target, { upstreamReferenceImages: getUpstreamImages(edge.target) })
        continue
      }

      if (targetNode.type === 'videoGen') {
        updateNodeData(edge.target, { sourceImages: getUpstreamImages(edge.target) })
        continue
      }

      if (targetNode.type === 'imageDisplay') {
        updateNodeData(edge.target, { images: getUpstreamImages(edge.target) })
        continue
      }

      if (targetNode.type === 'videoDisplay') {
        updateNodeData(edge.target, { videos: getUpstreamVideos(edge.target) })
      }
    }
  },

  selectAll: () => {
    set({
      nodes: get().nodes.map((node) => ({ ...node, selected: true } as AppNode)),
      edges: get().edges.map((edge) => ({ ...edge, selected: true } as AppEdge)),
    })
  },

  autoLayout: () => {
    const { nodes, edges } = get()
    if (nodes.length <= 1) return

    get()._pushHistory()
    set({
      nodes: computeAutoLayoutNodes(nodes, edges),
      edges: edges.map((edge) => ({ ...edge, selected: false } as AppEdge)),
    })
  },

  clearCanvas: () => {
    if (get().nodes.length === 0 && get().edges.length === 0) return

    get()._pushHistory()
    set({ nodes: [], edges: [] })
  },

  setWorkflowMeta: (workflowId: string | null, workflowName: string) => {
    set({
      currentWorkflowId: workflowId,
      currentWorkflowName: workflowName,
    })
  },

  setWorkflowExecutionState: (isExecuting: boolean, activeNodeId: string | null = null) => {
    set({
      isWorkflowExecuting: isExecuting,
      activeExecutionNodeId: isExecuting ? activeNodeId : null,
    })
  },

  loadWorkflow: (workflow) => {
    const normalizedNodes = workflow.nodes.map((node) => {
      if (node.type === 'imageGen') {
        return {
          ...node,
          selected: false,
          data: syncImageGenDerivedState(node.data as Partial<ImageGenNodeData>),
        } as AppNode
      }

      if (node.type === 'videoGen') {
        return {
          ...node,
          selected: false,
          data: syncVideoGenDerivedState(node.data as Partial<VideoGenNodeData>),
        } as AppNode
      }

      return { ...node, selected: false } as AppNode
    })

    const normalizedEdges = workflow.edges.map((edge) => ({ ...edge, selected: false } as AppEdge))
    const initialHistory = cloneFlowState(normalizedNodes, normalizedEdges)

    set({
      nodes: normalizedNodes,
      edges: normalizedEdges,
      currentWorkflowId: workflow.id,
      currentWorkflowName: workflow.name,
      isWorkflowExecuting: false,
      activeExecutionNodeId: null,
      _history: [initialHistory],
      _historyIndex: 0,
      canUndo: false,
      canRedo: false,
    })
  },

  undo: () => {
    const { _history, _historyIndex } = get()
    if (_historyIndex <= 0) return

    const prevIndex = _historyIndex - 1
    const prevState = _history[prevIndex]

    set({
      nodes: JSON.parse(JSON.stringify(prevState.nodes)),
      edges: JSON.parse(JSON.stringify(prevState.edges)),
      _historyIndex: prevIndex,
      canUndo: prevIndex > 0,
      canRedo: true,
    })
  },

  redo: () => {
    const { _history, _historyIndex } = get()
    if (_historyIndex >= _history.length - 1) return

    const nextIndex = _historyIndex + 1
    const nextState = _history[nextIndex]

    set({
      nodes: JSON.parse(JSON.stringify(nextState.nodes)),
      edges: JSON.parse(JSON.stringify(nextState.edges)),
      _historyIndex: nextIndex,
      canUndo: true,
      canRedo: nextIndex < _history.length - 1,
    })
  },
}))
