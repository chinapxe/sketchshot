import { v4 as uuidv4 } from 'uuid'

import type {
  AppEdge,
  AppNode,
  AppNodeType,
  ImageDisplayNodeData,
  ImageGenNodeData,
  ImageUploadNodeData,
  VideoDisplayNodeData,
  VideoGenNodeData,
} from '../types'

export interface WorkflowTemplateDefinition {
  id: string
  name: string
  description: string
  nodes: AppNode[]
  edges: AppEdge[]
}

function createNodeBase<TData>(
  type: AppNodeType,
  position: { x: number; y: number },
  data: TData
): AppNode {
  return {
    id: uuidv4(),
    type,
    position,
    data,
  } as AppNode
}

function createUploadNode(position: { x: number; y: number }, label: string): AppNode {
  return createNodeBase<ImageUploadNodeData>('imageUpload', position, {
    label,
    imageUrl: undefined,
    fileName: undefined,
    isUploading: false,
    uploadError: undefined,
  })
}

function createImageGenNode(
  position: { x: number; y: number },
  options: Partial<ImageGenNodeData> & Pick<ImageGenNodeData, 'label' | 'prompt'>
): AppNode {
  return createNodeBase<ImageGenNodeData>('imageGen', position, {
    label: options.label,
    prompt: options.prompt,
    aspectRatio: options.aspectRatio ?? '1:1',
    resolution: options.resolution ?? '2K',
    adapter: options.adapter ?? 'volcengine',
    upstreamReferenceImages: [],
    manualReferenceImages: [],
    referenceImages: [],
    isUploadingReferences: false,
    referenceUploadError: undefined,
    identityLock: options.identityLock ?? false,
    identityStrength: options.identityStrength ?? 0.7,
    status: 'idle',
    progress: 0,
    creditCost: options.creditCost ?? 30,
    outputImage: undefined,
    lastRunSignature: undefined,
    resultCache: {},
    needsRefresh: false,
    errorMessage: undefined,
  })
}

function createImageDisplayNode(position: { x: number; y: number }, label: string): AppNode {
  return createNodeBase<ImageDisplayNodeData>('imageDisplay', position, {
    label,
    images: [],
    status: 'idle',
  })
}

function createVideoGenNode(
  position: { x: number; y: number },
  options: Partial<VideoGenNodeData> & Pick<VideoGenNodeData, 'label' | 'prompt'>
): AppNode {
  return createNodeBase<VideoGenNodeData>('videoGen', position, {
    label: options.label,
    prompt: options.prompt,
    aspectRatio: options.aspectRatio ?? '16:9',
    durationSeconds: options.durationSeconds ?? 4,
    motionStrength: options.motionStrength ?? 0.6,
    adapter: options.adapter ?? 'volcengine',
    sourceImages: [],
    status: 'idle',
    progress: 0,
    creditCost: options.creditCost ?? 90,
    outputVideo: undefined,
    lastRunSignature: undefined,
    resultCache: {},
    needsRefresh: false,
    errorMessage: undefined,
  })
}

function createVideoDisplayNode(position: { x: number; y: number }, label: string): AppNode {
  return createNodeBase<VideoDisplayNodeData>('videoDisplay', position, {
    label,
    videos: [],
    status: 'idle',
  })
}

function createEdge(source: AppNode, target: AppNode): AppEdge {
  return {
    id: uuidv4(),
    source: source.id,
    target: target.id,
    type: 'smoothstep',
    animated: true,
  } as AppEdge
}

function createBasicStoryboardTemplate(): WorkflowTemplateDefinition {
  const uploadNode = createUploadNode({ x: 80, y: 140 }, 'Character Reference')
  const generateNode = createImageGenNode({ x: 420, y: 120 }, {
    label: 'Hero Portrait',
    prompt: 'cinematic portrait, soft key light, rich skin detail, sharp focus',
    aspectRatio: '3:4',
  })
  const displayNode = createImageDisplayNode({ x: 760, y: 120 }, 'Image Output')

  return {
    id: 'basic-storyboard',
    name: 'Basic Storyboard',
    description: 'Upload one reference image, generate a polished frame, and preview it.',
    nodes: [uploadNode, generateNode, displayNode],
    edges: [createEdge(uploadNode, generateNode), createEdge(generateNode, displayNode)],
  }
}

function createDualStyleTemplate(): WorkflowTemplateDefinition {
  const uploadNode = createUploadNode({ x: 80, y: 220 }, 'Character Reference')
  const editorialNode = createImageGenNode({ x: 420, y: 80 }, {
    label: 'Editorial Look',
    prompt: 'luxury editorial poster, golden light, premium texture, polished styling',
    aspectRatio: '3:4',
  })
  const cyberpunkNode = createImageGenNode({ x: 420, y: 320 }, {
    label: 'Cyberpunk Look',
    prompt: 'cyberpunk character concept, neon haze, futuristic skyline, vivid contrast',
    aspectRatio: '3:4',
  })
  const editorialDisplay = createImageDisplayNode({ x: 760, y: 80 }, 'Editorial Output')
  const cyberpunkDisplay = createImageDisplayNode({ x: 760, y: 320 }, 'Cyberpunk Output')

  return {
    id: 'dual-style-compare',
    name: 'Dual Style Compare',
    description: 'Branch one reference into two image generation paths for quick visual comparison.',
    nodes: [uploadNode, editorialNode, cyberpunkNode, editorialDisplay, cyberpunkDisplay],
    edges: [
      createEdge(uploadNode, editorialNode),
      createEdge(uploadNode, cyberpunkNode),
      createEdge(editorialNode, editorialDisplay),
      createEdge(cyberpunkNode, cyberpunkDisplay),
    ],
  }
}

function createThreeShotTemplate(): WorkflowTemplateDefinition {
  const uploadNode = createUploadNode({ x: 80, y: 280 }, 'Lead Character')
  const closeupNode = createImageGenNode({ x: 420, y: 40 }, {
    label: 'Close Up',
    prompt: 'cinematic close-up, emotional expression, shallow depth of field',
    aspectRatio: '3:4',
  })
  const mediumNode = createImageGenNode({ x: 420, y: 260 }, {
    label: 'Medium Shot',
    prompt: 'cinematic medium shot, natural pose, balanced composition',
    aspectRatio: '16:9',
  })
  const wideNode = createImageGenNode({ x: 420, y: 480 }, {
    label: 'Wide Shot',
    prompt: 'cinematic wide shot, strong environment storytelling, atmospheric scene',
    aspectRatio: '16:9',
  })
  const closeupDisplay = createImageDisplayNode({ x: 780, y: 40 }, 'Close Up Output')
  const mediumDisplay = createImageDisplayNode({ x: 780, y: 260 }, 'Medium Output')
  const wideDisplay = createImageDisplayNode({ x: 780, y: 480 }, 'Wide Output')

  return {
    id: 'three-shot-storyboard',
    name: 'Three Shot Storyboard',
    description: 'Generate close, medium, and wide frames from a single reference input.',
    nodes: [uploadNode, closeupNode, mediumNode, wideNode, closeupDisplay, mediumDisplay, wideDisplay],
    edges: [
      createEdge(uploadNode, closeupNode),
      createEdge(uploadNode, mediumNode),
      createEdge(uploadNode, wideNode),
      createEdge(closeupNode, closeupDisplay),
      createEdge(mediumNode, mediumDisplay),
      createEdge(wideNode, wideDisplay),
    ],
  }
}

function createImageToMotionTemplate(): WorkflowTemplateDefinition {
  const uploadNode = createUploadNode({ x: 80, y: 180 }, 'Key Frame')
  const videoNode = createVideoGenNode({ x: 420, y: 160 }, {
    label: 'Motion Clip',
    prompt: 'subtle camera push-in, fabric movement, cinematic motion',
    aspectRatio: '16:9',
    durationSeconds: 4,
    motionStrength: 0.6,
  })
  const displayNode = createVideoDisplayNode({ x: 780, y: 160 }, 'Video Output')

  return {
    id: 'image-to-motion',
    name: 'Image To Motion',
    description: 'Turn a still frame into a first-pass motion clip using the live Volcengine video pipeline.',
    nodes: [uploadNode, videoNode, displayNode],
    edges: [createEdge(uploadNode, videoNode), createEdge(videoNode, displayNode)],
  }
}

export const workflowTemplates: WorkflowTemplateDefinition[] = [
  createBasicStoryboardTemplate(),
  createDualStyleTemplate(),
  createThreeShotTemplate(),
  createImageToMotionTemplate(),
]
