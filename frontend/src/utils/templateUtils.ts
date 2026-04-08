import type {
  AppEdge,
  AppNode,
  CharacterNodeData,
  ContinuityNodeData,
  ImageDisplayNodeData,
  ImageGenNodeData,
  ImageUploadNodeData,
  ShotNodeData,
  ThreeViewGenNodeData,
  VideoDisplayNodeData,
  VideoGenNodeData,
} from '../types'

function sanitizeImageUploadNodeData(data: ImageUploadNodeData): ImageUploadNodeData {
  return {
    ...data,
    imageUrl: undefined,
    fileName: undefined,
    isUploading: false,
    uploadError: undefined,
  }
}

function sanitizeImageGenNodeData(data: ImageGenNodeData): ImageGenNodeData {
  return {
    ...data,
    upstreamReferenceImages: [],
    manualReferenceImages: [],
    referenceImages: [],
    isUploadingReferences: false,
    referenceUploadError: undefined,
    status: 'idle',
    progress: 0,
    creditCost: 30,
    outputImage: undefined,
    lastRunSignature: undefined,
    resultCache: {},
    needsRefresh: false,
    errorMessage: undefined,
  }
}

function sanitizeVideoGenNodeData(data: VideoGenNodeData): VideoGenNodeData {
  return {
    ...data,
    sourceImages: [],
    status: 'idle',
    progress: 0,
    creditCost: 90,
    outputVideo: undefined,
    lastRunSignature: undefined,
    resultCache: {},
    needsRefresh: false,
    errorMessage: undefined,
  }
}

function sanitizeThreeViewGenNodeData(data: ThreeViewGenNodeData): ThreeViewGenNodeData {
  return {
    ...data,
    referenceImages: [],
    creditCost: data.outputMode === 'split' ? 90 : 30,
    status: 'idle',
    progress: 0,
    outputImage: undefined,
    outputImages: {},
    lastRunSignature: undefined,
    resultCache: {},
    splitResultCache: {},
    needsRefresh: false,
    errorMessage: undefined,
  }
}

function sanitizeImageDisplayNodeData(data: ImageDisplayNodeData): ImageDisplayNodeData {
  return {
    ...data,
    images: [],
    status: 'idle',
  }
}

function sanitizeVideoDisplayNodeData(data: VideoDisplayNodeData): VideoDisplayNodeData {
  return {
    ...data,
    videos: [],
    status: 'idle',
  }
}

function sanitizeCharacterNodeData(data: CharacterNodeData): CharacterNodeData {
  return {
    ...data,
    referenceImages: [],
    threeViewSheetImage: undefined,
    threeViewImages: {},
    generatedThreeViewImages: undefined,
  }
}

function sanitizeContinuityNodeData(data: ContinuityNodeData): ContinuityNodeData {
  return {
    ...data,
    contextSignature: '',
    status: 'idle',
    progress: 0,
    creditCost: 30,
    outputImage: undefined,
    lastRunSignature: undefined,
    resultCache: {},
    needsRefresh: false,
    errorMessage: undefined,
  }
}

function sanitizeShotNodeData(data: ShotNodeData): ShotNodeData {
  return {
    ...data,
    videoFirstFrame: undefined,
    videoLastFrame: undefined,
    identityLock: false,
    referenceImages: [],
    contextSignature: '',
    status: 'idle',
    progress: 0,
    creditCost: data.outputType === 'video' ? 90 : 30,
    outputImage: undefined,
    outputVideo: undefined,
    lastRunSignature: undefined,
    resultCache: {},
    needsRefresh: false,
    errorMessage: undefined,
  }
}

export function sanitizeTemplateNode(node: AppNode): AppNode {
  switch (node.type) {
    case 'imageUpload':
      return {
        id: node.id,
        type: node.type,
        position: { ...node.position },
        data: sanitizeImageUploadNodeData(node.data as ImageUploadNodeData),
      } as AppNode
    case 'imageGen':
      return {
        id: node.id,
        type: node.type,
        position: { ...node.position },
        data: sanitizeImageGenNodeData(node.data as ImageGenNodeData),
      } as AppNode
    case 'threeViewGen':
      return {
        id: node.id,
        type: node.type,
        position: { ...node.position },
        data: sanitizeThreeViewGenNodeData(node.data as ThreeViewGenNodeData),
      } as AppNode
    case 'videoGen':
      return {
        id: node.id,
        type: node.type,
        position: { ...node.position },
        data: sanitizeVideoGenNodeData(node.data as VideoGenNodeData),
      } as AppNode
    case 'imageDisplay':
      return {
        id: node.id,
        type: node.type,
        position: { ...node.position },
        data: sanitizeImageDisplayNodeData(node.data as ImageDisplayNodeData),
      } as AppNode
    case 'videoDisplay':
      return {
        id: node.id,
        type: node.type,
        position: { ...node.position },
        data: sanitizeVideoDisplayNodeData(node.data as VideoDisplayNodeData),
      } as AppNode
    case 'character':
      return {
        id: node.id,
        type: node.type,
        position: { ...node.position },
        data: sanitizeCharacterNodeData(node.data as CharacterNodeData),
      } as AppNode
    case 'continuity':
      return {
        id: node.id,
        type: node.type,
        position: { ...node.position },
        data: sanitizeContinuityNodeData(node.data as ContinuityNodeData),
      } as AppNode
    case 'shot':
      return {
        id: node.id,
        type: node.type,
        position: { ...node.position },
        data: sanitizeShotNodeData(node.data as ShotNodeData),
      } as AppNode
    default:
      return {
        id: node.id,
        type: node.type,
        position: { ...node.position },
        data: JSON.parse(JSON.stringify(node.data)),
      } as AppNode
  }
}

export function sanitizeTemplateEdge(edge: AppEdge): AppEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
  } as AppEdge
}

export function sanitizeWorkflowForTemplate(nodes: AppNode[], edges: AppEdge[]): { nodes: AppNode[]; edges: AppEdge[] } {
  return {
    nodes: nodes.map((node) => sanitizeTemplateNode(node)),
    edges: edges.map((edge) => sanitizeTemplateEdge(edge)),
  }
}
