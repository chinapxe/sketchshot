import { v4 as uuidv4 } from 'uuid'

import type {
  AppEdge,
  AppNode,
  AppNodeType,
  CharacterNodeData,
  ContinuityNodeData,
  ImageDisplayNodeData,
  ImageGenNodeData,
  ImageUploadNodeData,
  SceneNodeData,
  ShotNodeData,
  StyleNodeData,
  ThreeViewGenNodeData,
  VideoDisplayNodeData,
  VideoGenNodeData,
} from '../types'
import { MAX_CHARACTER_IDENTITY_STRENGTH } from '../utils/characterConsistency'
import { CHARACTER_THREE_VIEW_TARGET_HANDLE_IDS, THREE_VIEW_SLOT_HANDLE_IDS } from '../utils/threeView'

export interface WorkflowTemplateDefinition {
  id: string
  name: string
  description: string
  category: 'recommended' | 'storyboard' | 'character' | 'video' | 'compare' | 'basic'
  recommended?: boolean
  useCases?: string[]
  presetHighlights?: string[]
  learningPoints: string[]
  firstActionHint: string
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
    identityLock: options.identityLock ?? true,
    identityStrength: options.identityStrength ?? MAX_CHARACTER_IDENTITY_STRENGTH,
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

function createThreeViewGenNode(
  position: { x: number; y: number },
  options: Partial<ThreeViewGenNodeData> & Pick<ThreeViewGenNodeData, 'label' | 'prompt'>
): AppNode {
  const outputMode = options.outputMode ?? 'sheet'

  return createNodeBase<ThreeViewGenNodeData>('threeViewGen', position, {
    label: options.label,
    prompt: options.prompt,
    aspectRatio: options.aspectRatio ?? '16:9',
    resolution: options.resolution ?? '2K',
    adapter: options.adapter ?? 'volcengine',
    referenceImages: [],
    outputMode,
    status: 'idle',
    progress: 0,
    creditCost: outputMode === 'split' ? 90 : 30,
    outputImage: undefined,
    outputImages: {},
    lastRunSignature: undefined,
    resultCache: {},
    splitResultCache: {},
    needsRefresh: false,
    errorMessage: undefined,
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

function createSceneNode(
  position: { x: number; y: number },
  options: Partial<SceneNodeData> & Pick<SceneNodeData, 'label' | 'title'>
): AppNode {
  return createNodeBase<SceneNodeData>('scene', position, {
    label: options.label,
    title: options.title,
    synopsis: options.synopsis ?? '',
    beat: options.beat ?? '',
    notes: options.notes ?? '',
  })
}

function createCharacterNode(
  position: { x: number; y: number },
  options: Partial<CharacterNodeData> & Pick<CharacterNodeData, 'label' | 'name'>
): AppNode {
  return createNodeBase<CharacterNodeData>('character', position, {
    label: options.label,
    name: options.name,
    role: options.role ?? '',
    appearance: options.appearance ?? '',
    temperamentTags: options.temperamentTags ?? [],
    stateTags: options.stateTags ?? [],
    wardrobe: options.wardrobe ?? '',
    props: options.props ?? '',
    notes: options.notes ?? '',
    referenceImages: options.referenceImages ?? [],
    threeViewImages: options.threeViewImages ?? {},
  })
}

function createStyleNode(
  position: { x: number; y: number },
  options: Partial<StyleNodeData> & Pick<StyleNodeData, 'label' | 'name'>
): AppNode {
  return createNodeBase<StyleNodeData>('style', position, {
    label: options.label,
    name: options.name,
    keywords: options.keywords ?? '',
    palette: options.palette ?? '',
    lighting: options.lighting ?? '',
    framing: options.framing ?? '',
    styleTags: options.styleTags ?? [],
    paletteTags: options.paletteTags ?? [],
    lightingTags: options.lightingTags ?? [],
    framingTags: options.framingTags ?? [],
    qualityTags: options.qualityTags ?? [],
    notes: options.notes ?? '',
  })
}

function createShotNode(
  position: { x: number; y: number },
  options: Partial<ShotNodeData> & Pick<ShotNodeData, 'label' | 'title' | 'description'>
): AppNode {
  const outputType = options.outputType ?? 'image'

  return createNodeBase<ShotNodeData>('shot', position, {
    label: options.label,
    title: options.title,
    description: options.description,
    prompt: options.prompt ?? '',
    continuityFrames: options.continuityFrames ?? Array.from({ length: 9 }, () => ''),
    videoFirstFrame: options.videoFirstFrame,
    videoLastFrame: options.videoLastFrame,
    shotSize: options.shotSize ?? 'medium',
    cameraAngle: options.cameraAngle ?? 'eye-level',
    cameraMovement: options.cameraMovement ?? '',
    composition: options.composition ?? '',
    lightingStyle: options.lightingStyle ?? '',
    moodTags: options.moodTags ?? [],
    qualityTags: options.qualityTags ?? [],
    motion: options.motion ?? '',
    emotion: options.emotion ?? '',
    aspectRatio: options.aspectRatio ?? '16:9',
    resolution: options.resolution ?? '2K',
    outputType,
    imageAdapter: options.imageAdapter ?? 'volcengine',
    videoAdapter: options.videoAdapter ?? 'volcengine',
    durationSeconds: options.durationSeconds ?? 4,
    motionStrength: options.motionStrength ?? 0.6,
    identityLock: options.identityLock ?? true,
    identityStrength: options.identityStrength ?? MAX_CHARACTER_IDENTITY_STRENGTH,
    referenceImages: [],
    contextSignature: '',
    status: 'idle',
    progress: 0,
    creditCost: outputType === 'video' ? 90 : 30,
    outputImage: undefined,
    outputVideo: undefined,
    lastRunSignature: undefined,
    resultCache: {},
    needsRefresh: false,
    errorMessage: undefined,
  })
}

function createContinuityNode(
  position: { x: number; y: number },
  options: Partial<ContinuityNodeData> & Pick<ContinuityNodeData, 'label'>
): AppNode {
  return createNodeBase<ContinuityNodeData>('continuity', position, {
    label: options.label,
    collapsed: options.collapsed ?? false,
    prompt: options.prompt ?? '',
    frames: Array.from({ length: 9 }, (_, index) => options.frames?.[index] ?? ''),
  })
}

function createEdge(
  source: AppNode,
  target: AppNode,
  handles?: {
    sourceHandle?: string
    targetHandle?: string
  }
): AppEdge {
  return {
    id: uuidv4(),
    source: source.id,
    target: target.id,
    sourceHandle: handles?.sourceHandle,
    targetHandle: handles?.targetHandle,
    type: 'smoothstep',
    animated: false,
  } as AppEdge
}

function createBasicStoryboardTemplate(): WorkflowTemplateDefinition {
  const uploadNode = createUploadNode({ x: 80, y: 140 }, '角色参考图')
  const generateNode = createImageGenNode({ x: 420, y: 120 }, {
    label: '主角定妆图',
    prompt: '电影感肖像，柔和主光，肤质细节丰富，锐利对焦',
    aspectRatio: '3:4',
  })
  const displayNode = createImageDisplayNode({ x: 760, y: 120 }, '图像结果')

  return {
    id: 'basic-storyboard',
    name: '基础出图链路',
    description: '从上传参考图到图片生成的最小闭环，适合先熟悉画布、连线和生成按钮。',
    category: 'basic',
    useCases: ['快速熟悉画布', '单张角色定妆', '最小出图闭环'],
    presetHighlights: ['单参考图起步', '3:4 角色定妆向', '无故事板负担'],
    learningPoints: ['上传图节点', '图片生成节点', '输出预览'],
    firstActionHint: '先上传一张参考图，再点击图片生成节点的生成按钮。',
    nodes: [uploadNode, generateNode, displayNode],
    edges: [createEdge(uploadNode, generateNode), createEdge(generateNode, displayNode)],
  }
}

function createStoryboardDirectorTemplate(): WorkflowTemplateDefinition {
  const sceneNode = createSceneNode({ x: 60, y: 180 }, {
    label: '场次',
    title: '雨夜天台对峙',
    synopsis: '主角终于逼近真相，在暴雨和霓虹之间与旧友摊牌。',
    beat: '关系破裂，人物做出不可逆决定。',
  })
  const characterNode = createCharacterNode({ x: 60, y: 420 }, {
    label: '角色',
    name: '沈迟',
    role: '落魄调查记者',
    appearance: '消瘦、短发、眼神警惕，长期奔波后的疲惫感明显。',
    temperamentTags: ['疲惫', '压抑'],
    stateTags: ['湿发'],
    wardrobe: '深色风衣、旧皮靴',
    props: '录音笔',
  })
  const styleNode = createStyleNode({ x: 420, y: 40 }, {
    styleTags: ['电影写实', '动作悬疑'],
    paletteTags: ['冷青灰', '低饱和', '雨夜霓虹'],
    lightingTags: ['夜景霓虹光', '轮廓边缘光'],
    framingTags: ['压迫式留白', '前景遮挡'],
    qualityTags: ['电影感', '胶片颗粒'],
    label: '风格',
    name: '冷峻都市悬疑',
    keywords: '雨夜霓虹、低饱和、电影感、强对比',
    palette: '冷青灰 + 局部暖橙',
    lighting: '侧逆光、霓虹边缘光',
    framing: '压迫式留白、人物偏边缘',
  })
  const shotNode = createShotNode({ x: 420, y: 280 }, {
    cameraMovement: '缓慢推近',
    composition: '前景遮挡',
    lightingStyle: '侧逆光',
    moodTags: ['压抑', '决绝'],
    qualityTags: ['电影感', '细节丰富'],
    label: '镜头',
    title: '主角回头定格',
    description: '主角在雨中半侧身回头，眼神复杂，城市霓虹在身后虚化。',
    motion: '衣摆被风吹动，雨水顺着发梢落下',
    emotion: '压抑又决绝',
    shotSize: 'medium',
    cameraAngle: 'eye-level',
    aspectRatio: '16:9',
    outputType: 'image',
  })
  const displayNode = createImageDisplayNode({ x: 800, y: 280 }, '镜头结果')
  const uploadNode = createUploadNode({ x: 60, y: 660 }, '角色参考图')

  return {
    id: 'storyboard-director',
    name: '故事板单镜头入门',
    description: '用场次、角色、风格、镜头四类新节点搭出第一个故事板镜头，快速理解新节点主链路。',
    category: 'recommended',
    recommended: true,
    useCases: ['单镜头故事板', '角色定妆后出镜头', '雨夜都市悬疑'],
    presetHighlights: ['角色参考先沉淀', '冷峻都市悬疑风格', '中景回头定格'],
    learningPoints: ['场次节点', '角色节点', '风格节点', '镜头节点'],
    firstActionHint: '先把角色参考上传到角色节点，再直接生成镜头，感受四类节点的继承关系。',
    nodes: [sceneNode, characterNode, styleNode, shotNode, displayNode, uploadNode],
    edges: [
      createEdge(sceneNode, shotNode),
      createEdge(characterNode, shotNode),
      createEdge(styleNode, shotNode),
      createEdge(uploadNode, characterNode),
      createEdge(shotNode, displayNode),
    ],
  }
}

function createDualStyleTemplate(): WorkflowTemplateDefinition {
  const uploadNode = createUploadNode({ x: 80, y: 220 }, '角色参考图')
  const editorialNode = createImageGenNode({ x: 420, y: 80 }, {
    label: '杂志风方案',
    prompt: '高级时尚海报质感，鎏金光线，极致质感，精致造型',
    aspectRatio: '3:4',
  })
  const cyberpunkNode = createImageGenNode({ x: 420, y: 320 }, {
    label: '赛博风方案',
    prompt: '赛博朋克角色设定，霓虹薄雾，未来都市天际线，强烈色彩对比',
    aspectRatio: '3:4',
  })
  const editorialDisplay = createImageDisplayNode({ x: 760, y: 80 }, '杂志风结果')
  const cyberpunkDisplay = createImageDisplayNode({ x: 760, y: 320 }, '赛博风结果')

  return {
    id: 'dual-style-compare',
    name: '双风格对比',
    description: '让同一角色在两套风格设定下分别出图，快速理解风格节点如何分支使用。',
    category: 'compare',
    useCases: ['双方案对比', '同题材换风格', '找视觉方向'],
    presetHighlights: ['同角色双分支', '时尚 / 赛博对比', '3:4 角色海报向'],
    learningPoints: ['风格分支', '同题材对比', '多结果预览'],
    firstActionHint: '先上传一张角色参考图，再分别执行两个风格分支查看差异。',
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
  const uploadNode = createUploadNode({ x: 80, y: 280 }, '主角参考图')
  const closeupNode = createImageGenNode({ x: 420, y: 40 }, {
    label: '近景方案',
    prompt: '电影感特写，情绪表达强烈，浅景深',
    aspectRatio: '3:4',
  })
  const mediumNode = createImageGenNode({ x: 420, y: 260 }, {
    label: '中景方案',
    prompt: '电影感中景，姿态自然，构图均衡',
    aspectRatio: '16:9',
  })
  const wideNode = createImageGenNode({ x: 420, y: 480 }, {
    label: '远景方案',
    prompt: '电影感全景，环境叙事强烈，氛围氛围感场景',
    aspectRatio: '16:9',
  })
  const closeupDisplay = createImageDisplayNode({ x: 780, y: 40 }, '近景结果')
  const mediumDisplay = createImageDisplayNode({ x: 780, y: 260 }, '中景结果')
  const wideDisplay = createImageDisplayNode({ x: 780, y: 480 }, '远景结果')

  return {
    id: 'three-shot-storyboard',
    name: '三景别分镜',
    description: '从一个角色参考出发，分别生成近景、中景、远景，适合快速熟悉分镜拆解方式。',
    category: 'storyboard',
    useCases: ['景别练习', '单角色三分镜', '分镜节奏入门'],
    presetHighlights: ['近中远三景别', '同参考多镜头', '横版叙事对比'],
    learningPoints: ['分镜拆解', '景别变化', '多镜头组织'],
    firstActionHint: '上传同一角色参考后，按近景、中景、远景顺序分别生成，观察镜头差异。',
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
  const uploadNode = createUploadNode({ x: 80, y: 180 }, '关键帧上传')
  const videoNode = createVideoGenNode({ x: 420, y: 160 }, {
    label: '动态片段',
    prompt: '轻微缓慢推镜，衣物自然飘动，电影级动态感',
    aspectRatio: '16:9',
    durationSeconds: 4,
    motionStrength: 0.6,
  })
  const displayNode = createVideoDisplayNode({ x: 780, y: 160 }, '视频结果')

  return {
    id: 'image-to-motion',
    name: '图生视频最小链路',
    description: '从一张关键帧生成视频片段，适合先熟悉视频生成入口和输出预览。',
    category: 'video',
    useCases: ['图生视频入门', '单帧动起来', '最小视频闭环'],
    presetHighlights: ['关键帧起步', '16:9 4秒片段', '轻运动镜头'],
    learningPoints: ['图生视频', '视频节点', '结果预览'],
    firstActionHint: '先上传关键帧，再执行视频节点，熟悉最基础的视频链路。',
    nodes: [uploadNode, videoNode, displayNode],
    edges: [createEdge(uploadNode, videoNode), createEdge(videoNode, displayNode)],
  }
}

function createStoryboardSequenceTemplate(): WorkflowTemplateDefinition {
  const sceneNode = createSceneNode({ x: 60, y: 220 }, {
    label: '场次',
    title: '雨夜追逐',
    synopsis: '主角在狭窄巷道里短暂停步，确认身后动静后继续向前冲。',
    beat: '从警觉到决断，情绪逐步推高。',
    notes: '建议按镜头 01 -> 镜头 02 -> 镜头 03 的顺序执行，感受镜头承接关系。',
  })
  const characterNode = createCharacterNode({ x: 60, y: 500 }, {
    label: '角色',
    name: '林雾',
    role: '被追踪的情报员',
    appearance: '短发、冷白皮、眼神警觉，奔跑后呼吸急促。',
    temperamentTags: ['冷静', '锋利'],
    stateTags: ['奔跑后', '狼狈'],
    wardrobe: '深灰连帽外套、黑色长裤',
    props: '加密芯片盒',
    notes: '先上传角色参考，再依次生成镜头，观察角色状态如何延续。',
  })
  const styleNode = createStyleNode({ x: 420, y: 60 }, {
    styleTags: ['电影写实', '动作悬疑'],
    paletteTags: ['冷青灰', '雨夜霓虹'],
    lightingTags: ['夜景霓虹光', '轮廓边缘光'],
    framingTags: ['前景遮挡', '斜线构图'],
    qualityTags: ['电影感', '胶片颗粒'],
    label: '风格',
    name: '冷雨都市动作感',
    keywords: '雨夜反光地面、霓虹溢色、手持摄影感、压迫空间',
    palette: '冷蓝灰 + 少量警灯红',
    lighting: '背光 + 局部霓虹边缘光',
    framing: '前景遮挡、斜线构图、动势明显',
    notes: '适合演示多个镜头共享同一场次和风格设定。',
  })
  const uploadNode = createUploadNode({ x: 60, y: 760 }, '角色参考上传')
  const shot1 = createShotNode({ x: 420, y: 260 }, {
    cameraMovement: '手持跟随',
    composition: '纵深透视',
    lightingStyle: '雨夜反光',
    moodTags: ['紧张'],
    qualityTags: ['电影感'],
    label: '镜头',
    title: '镜头 01 · 巷口停步',
    description: '主角从雨里冲进巷口，突然停下半步，肩膀还带着惯性。',
    prompt: '先生成这个镜头，为后续镜头建立服装、状态和环境参考。',
    shotSize: 'wide',
    cameraAngle: 'eye-level',
    motion: '冲刺后急停，水花飞溅',
    emotion: '警觉',
    aspectRatio: '16:9',
    outputType: 'image',
  })
  const shot2 = createShotNode({ x: 780, y: 260 }, {
    cameraMovement: '缓慢推近',
    composition: '大面积留白',
    lightingStyle: '轮廓边缘光',
    moodTags: ['紧张', '冷峻'],
    qualityTags: ['细节丰富'],
    label: '镜头',
    title: '镜头 02 · 回头特写',
    description: '主角缓慢回头，雨水顺着脸侧落下，眼神在昏暗中聚焦。',
    prompt: '生成后可作为后续视频镜头的上游静帧参考。',
    shotSize: 'close-up',
    cameraAngle: 'over-shoulder',
    motion: '头部缓慢回看',
    emotion: '紧张克制',
    aspectRatio: '16:9',
    outputType: 'image',
  })
  const shot3 = createShotNode({ x: 1140, y: 260 }, {
    cameraMovement: '平移跟拍',
    composition: '斜线构图',
    lightingStyle: '侧逆光',
    moodTags: ['决绝'],
    qualityTags: ['电影感', '空气透视'],
    label: '镜头',
    title: '镜头 03 · 冲刺转场',
    description: '主角确认目标后重新启动，身体前压，快速冲向画面外侧。',
    prompt: '可在生成前补充首帧/尾帧约束，体验连续镜头的视频生成方式。',
    continuityFrames: [
      '角色仍保持回头后的停顿状态',
      '目光重新锁定前方',
      '肩膀向前发力',
      '脚步启动离地',
      '身体重心前移',
      '外套下摆被甩开',
      '速度迅速拉起来',
      '画面产生明显方向动势',
      '角色冲出画面边缘',
    ],
    shotSize: 'medium',
    cameraAngle: 'eye-level',
    motion: '回头确认后立即再次冲刺',
    emotion: '决断',
    aspectRatio: '16:9',
    outputType: 'video',
    durationSeconds: 5,
    motionStrength: 0.75,
  })
  const displayNode = createVideoDisplayNode({ x: 1480, y: 260 }, '片段预览')

  return {
    id: 'storyboard-sequence',
    name: '推荐 · 一场戏三镜头',
    description: '展示场次、角色、风格如何共同服务多个镜头，并通过镜头连线表达片段顺序。',
    category: 'recommended',
    recommended: true,
    useCases: ['一场戏三镜头', '连续叙事', '镜头承接演示'],
    presetHighlights: ['场次 / 角色 / 风格共享', '前两镜图片 + 第三镜视频', '动作承接明确'],
    learningPoints: ['多镜头片段', '镜头串联承接', '连续视频镜头'],
    firstActionHint: '建议先生成镜头 01，再生成镜头 02，最后再执行视频镜头 03。',
    nodes: [sceneNode, characterNode, styleNode, uploadNode, shot1, shot2, shot3, displayNode],
    edges: [
      createEdge(uploadNode, characterNode),
      createEdge(sceneNode, shot1),
      createEdge(sceneNode, shot2),
      createEdge(sceneNode, shot3),
      createEdge(characterNode, shot1),
      createEdge(characterNode, shot2),
      createEdge(characterNode, shot3),
      createEdge(styleNode, shot1),
      createEdge(styleNode, shot2),
      createEdge(styleNode, shot3),
      createEdge(shot1, shot2),
      createEdge(shot2, shot3),
      createEdge(shot3, displayNode),
    ],
  }
}

function createCharacterSheetTemplate(): WorkflowTemplateDefinition {
  const uploadFront = createUploadNode({ x: 60, y: 120 }, '正面参考上传')
  const uploadSide = createUploadNode({ x: 60, y: 300 }, '侧面参考上传')
  const uploadBack = createUploadNode({ x: 60, y: 480 }, '背面参考上传')
  const characterNode = createCharacterNode({ x: 420, y: 300 }, {
    label: '角色',
    name: '苏离',
    role: '故事主角 / 民国女画师',
    appearance: '瘦高身形、眉眼清冷、发髻利落，神态内敛但专注。',
    temperamentTags: ['冷静', '温柔'],
    stateTags: ['整洁'],
    wardrobe: '素色旗袍、长风衣',
    props: '画夹、旧钢笔',
    notes: '把三张上传图分别接到角色节点左侧的正面 / 侧面 / 背面入口后，会自动沉淀到人物三视图。',
  })
  const sceneNode = createSceneNode({ x: 760, y: 120 }, {
    label: '场次',
    title: '定妆拍摄',
    synopsis: '用于先稳定角色形象，再把角色带进正式镜头。',
    beat: '角色初次亮相',
    notes: '这是一个偏“角色定妆”的入门模板。',
  })
  const styleNode = createStyleNode({ x: 760, y: 360 }, {
    styleTags: ['复古胶片', '电影写实'],
    paletteTags: ['米白暗红', '暖金棕'],
    lightingTags: ['柔和棚拍光', '轮廓边缘光'],
    framingTags: ['居中压迫', '浅景深主体'],
    qualityTags: ['电影感', '高级肤质'],
    label: '风格',
    name: '复古电影定妆',
    keywords: '柔光棚拍、细节质感、旧胶片色调、人物海报感',
    palette: '米白 + 暗红',
    lighting: '柔和主光 + 轮廓光',
    framing: '稳定中近景、角色居中',
    notes: '适合先熟悉角色节点如何向镜头提供统一设定。',
  })
  const shotNode = createShotNode({ x: 1100, y: 240 }, {
    cameraMovement: '静止镜头',
    composition: '居中构图',
    lightingStyle: '自然柔光',
    moodTags: ['温暖', '冷峻'],
    qualityTags: ['高级质感', '超写实'],
    label: '镜头',
    title: '角色定妆镜头',
    description: '角色站定看向镜头外侧，保留完整服装轮廓和气质。',
    prompt: '先用这个镜头确认角色稳定性，再继续正式故事板镜头。',
    shotSize: 'medium',
    cameraAngle: 'eye-level',
    motion: '站定，衣摆轻微摆动',
    emotion: '平静克制',
    aspectRatio: '3:4',
    outputType: 'image',
  })
  const displayNode = createImageDisplayNode({ x: 1440, y: 240 }, '角色镜头预览')

  return {
    id: 'character-sheet-to-shot',
    name: '推荐 · 角色设定到镜头',
    description: '展示三张参考上传如何沉淀进角色设定，再统一供镜头复用，适合先学会角色节点。',
    category: 'character',
    recommended: true,
    useCases: ['角色设定先行', '三视图沉淀', '角色稳定性确认'],
    presetHighlights: ['三张参考图沉淀角色', '定妆镜头验证', '3:4 人物设定向'],
    learningPoints: ['角色三视图', '角色设定复用', '角色到镜头继承'],
    firstActionHint: '先把三张参考图分别接到角色节点左侧的正面、侧面、背面入口，再直接生成定妆镜头。',
    nodes: [uploadFront, uploadSide, uploadBack, characterNode, sceneNode, styleNode, shotNode, displayNode],
    edges: [
      createEdge(uploadFront, characterNode, { targetHandle: CHARACTER_THREE_VIEW_TARGET_HANDLE_IDS.front }),
      createEdge(uploadSide, characterNode, { targetHandle: CHARACTER_THREE_VIEW_TARGET_HANDLE_IDS.side }),
      createEdge(uploadBack, characterNode, { targetHandle: CHARACTER_THREE_VIEW_TARGET_HANDLE_IDS.back }),
      createEdge(characterNode, shotNode),
      createEdge(sceneNode, shotNode),
      createEdge(styleNode, shotNode),
      createEdge(shotNode, displayNode),
    ],
  }
}

function createThreeViewToCharacterTemplate(): WorkflowTemplateDefinition {
  const uploadNode = createUploadNode({ x: 60, y: 320 }, '角色参考上传')
  const threeViewNode = createThreeViewGenNode({ x: 420, y: 260 }, {
    label: '三视图生成',
    prompt: '保持同一角色的发型、服装、体型和配色一致，输出全身站姿的正面、侧面、背面三视图，背景干净，适合作为角色设定。',
    aspectRatio: '3:4',
    outputMode: 'split',
  })
  const threeViewDisplayNode = createImageDisplayNode({ x: 760, y: 80 }, '三视图结果预览')
  const characterNode = createCharacterNode({ x: 760, y: 360 }, {
    label: '角色',
    name: '苏离',
    role: '故事主角 / 民国女画师',
    appearance: '瘦高身形、眉眼清冷、发髻利落，神态内敛但专注，适合先稳定人物设定再进入正式镜头。',
    temperamentTags: ['冷静', '温柔'],
    stateTags: ['整洁'],
    wardrobe: '素色旗袍、长风衣',
    props: '画夹、旧钢笔',
    notes: '上游三视图节点的正面 / 侧面 / 背面输出已分别连到角色节点对应入口，生成后会自动沉淀到人物三视图槽位。',
  })
  const sceneNode = createSceneNode({ x: 1120, y: 120 }, {
    label: '场次',
    title: '角色定妆确认',
    synopsis: '先用一张定妆镜头确认角色在正式故事板中的稳定形象，再进入后续剧情镜头。',
    beat: '角色第一次完整亮相，重点检查服装、轮廓和气质是否稳定。',
    notes: '这套模板适合先跑通“三视图节点 -> 角色节点 -> 镜头节点”的完整链路。',
  })
  const styleNode = createStyleNode({ x: 1120, y: 460 }, {
    styleTags: ['电影写实', '人物定妆'],
    paletteTags: ['米白暗红', '暖金棕'],
    lightingTags: ['柔和棚拍光', '轮廓边缘光'],
    framingTags: ['居中构图', '稳定中景'],
    qualityTags: ['高级质感', '细节清晰'],
    label: '风格',
    name: '复古电影定妆',
    keywords: '电影感角色定妆，细节清晰，服装材质明确，人物气质稳定',
    palette: '米白、暗红、暖金棕',
    lighting: '柔和主光加轻微轮廓光',
    framing: '中景居中，优先完整展示人物轮廓和服装',
    notes: '适合检验角色三视图沉淀后，镜头生成是否还能保持统一形象。',
  })
  const shotNode = createShotNode({ x: 1460, y: 300 }, {
    label: '镜头',
    title: '角色定妆镜头',
    description: '角色站定看向镜头外侧，保留完整服装轮廓和稳定气质，用于确认角色设定已经可以进入正式故事板。',
    prompt: '优先保持角色形象稳定，完整展示服装、发型和体态，不追求激烈动作。',
    shotSize: 'medium',
    cameraAngle: 'eye-level',
    cameraMovement: '静止镜头',
    composition: '居中构图',
    lightingStyle: '柔和主光',
    moodTags: ['平静', '克制'],
    qualityTags: ['电影感', '细节丰富'],
    motion: '站姿稳定，衣摆轻微摆动',
    emotion: '冷静专注',
    aspectRatio: '3:4',
    outputType: 'image',
  })
  const displayNode = createImageDisplayNode({ x: 1800, y: 300 }, '定妆镜头结果')

  return {
    id: 'three-view-to-character-shot',
    name: '推荐 · 三视图生成接入角色',
    description: '从一张角色参考图出发，先生成三视图并沉淀到角色节点，再把正式三视图带入定妆镜头，是当前最贴近实际用法的角色模板。',
    category: 'character',
    recommended: true,
    useCases: ['角色定妆起步', '三视图自动沉淀', '角色稳定性验证'],
    presetHighlights: ['三视图节点直连角色', '角色正式三视图下游复用', '3:4 定妆镜头验证'],
    learningPoints: ['三视图生成节点', '角色正式三视图', '角色到镜头复用'],
    firstActionHint: '先上传一张角色参考图，执行三视图生成节点，再到角色节点确认人物三视图，最后生成定妆镜头。',
    nodes: [uploadNode, threeViewNode, threeViewDisplayNode, characterNode, sceneNode, styleNode, shotNode, displayNode],
    edges: [
      createEdge(uploadNode, threeViewNode),
      createEdge(uploadNode, characterNode),
      createEdge(threeViewNode, threeViewDisplayNode),
      createEdge(threeViewNode, characterNode, {
        sourceHandle: THREE_VIEW_SLOT_HANDLE_IDS.front,
        targetHandle: CHARACTER_THREE_VIEW_TARGET_HANDLE_IDS.front,
      }),
      createEdge(threeViewNode, characterNode, {
        sourceHandle: THREE_VIEW_SLOT_HANDLE_IDS.side,
        targetHandle: CHARACTER_THREE_VIEW_TARGET_HANDLE_IDS.side,
      }),
      createEdge(threeViewNode, characterNode, {
        sourceHandle: THREE_VIEW_SLOT_HANDLE_IDS.back,
        targetHandle: CHARACTER_THREE_VIEW_TARGET_HANDLE_IDS.back,
      }),
      createEdge(characterNode, shotNode),
      createEdge(sceneNode, shotNode),
      createEdge(styleNode, shotNode),
      createEdge(shotNode, displayNode),
    ],
  }
}

function createVideoContinuityTemplate(): WorkflowTemplateDefinition {
  const firstFrameUpload = createUploadNode({ x: 60, y: 140 }, '首帧参考上传')
  const lastFrameUpload = createUploadNode({ x: 60, y: 360 }, '尾帧参考上传')
  const sceneNode = createSceneNode({ x: 420, y: 80 }, {
    label: '场次',
    title: '走廊惊觉',
    synopsis: '角色在走廊尽头忽然停住，察觉异样后缓慢回头。',
    beat: '从运动到停顿，再到情绪收紧。',
    notes: '适合体验首帧/尾帧约束和九宫格连续动作。',
  })
  const characterNode = createCharacterNode({ x: 420, y: 360 }, {
    label: '角色',
    name: '沈迟',
    role: '调查记者',
    appearance: '短发、消瘦、眼神带警觉感。',
    temperamentTags: ['冷静', '压抑'],
    stateTags: ['奔跑后'],
    wardrobe: '深色风衣',
    props: '录音笔',
    notes: '也可以把角色参考图连到这里，再一并连接到视频镜头。',
  })
  const styleNode = createStyleNode({ x: 760, y: 80 }, {
    styleTags: ['黑色电影', '动作悬疑'],
    paletteTags: ['冷青灰', '低饱和'],
    lightingTags: ['顶光压迫', '局部硬光'],
    framingTags: ['广角纵深', '对称构图'],
    qualityTags: ['电影感', '质感克制'],
    label: '风格',
    name: '冷峻悬疑长镜头',
    keywords: '走廊透视、低饱和、静压感、微弱闪烁光源',
    palette: '冷灰蓝',
    lighting: '顶灯 + 尽头反光',
    framing: '单点透视、空间纵深明显',
    notes: '让视频镜头更强调连续动作和空间推进。',
  })
  const continuityNode = createContinuityNode({ x: 1100, y: 520 }, {
    label: '九宫格动作',
    frames: [
      '角色仍保持前冲后的惯性',
      '脚步开始减速',
      '身体轻微失衡',
      '停住呼吸急促',
      '肩膀先回转',
      '头部缓慢跟上',
      '视线开始偏移',
      '目光锁定后方目标',
      '情绪最终收紧停住',
    ],
  })
  const shotNode = createShotNode({ x: 1460, y: 240 }, {
    cameraMovement: '缓慢推近',
    composition: '纵深透视',
    lightingStyle: '顶光压迫',
    moodTags: ['紧张', '神秘'],
    qualityTags: ['电影感', '空气透视'],
    label: '镜头',
    title: '停步回头视频镜头',
    description: '角色在奔跑中停住，呼吸急促，随后缓慢回头看向后方。',
    prompt: '上传首帧和尾帧后，可在镜头节点里分别选择约束图，再生成视频。',
    shotSize: 'medium',
    cameraAngle: 'eye-level',
    motion: '先快后慢，最终停住回看',
    emotion: '惊觉',
    aspectRatio: '16:9',
    outputType: 'video',
    durationSeconds: 5,
    motionStrength: 0.7,
  })
  const displayNode = createVideoDisplayNode({ x: 1800, y: 240 }, '视频结果预览')

  return {
    id: 'video-continuity-shot',
    name: '推荐 · 连续动作视频镜头',
    description: '展示首帧/尾帧上传、场次/角色/风格设定和视频镜头如何组合使用。',
    category: 'video',
    recommended: true,
    useCases: ['首尾帧视频', '连续动作练习', '长镜头感'],
    presetHighlights: ['首帧 + 尾帧双约束', '九宫格动作拆解', '5秒视频镜头'],
    learningPoints: ['首帧/尾帧约束', '九宫格连续动作', '视频镜头主链路'],
    firstActionHint: '先上传首帧和尾帧参考，再补充九宫格动作节点，最后在视频镜头里选择约束图后执行生成。',
    nodes: [firstFrameUpload, lastFrameUpload, sceneNode, characterNode, styleNode, continuityNode, shotNode, displayNode],
    edges: [
      createEdge(firstFrameUpload, shotNode),
      createEdge(lastFrameUpload, shotNode),
      createEdge(sceneNode, shotNode),
      createEdge(characterNode, shotNode),
      createEdge(styleNode, shotNode),
      createEdge(continuityNode, shotNode),
      createEdge(shotNode, displayNode),
    ],
  }
}

export const workflowTemplates: WorkflowTemplateDefinition[] = [
  createStoryboardDirectorTemplate(),
  createStoryboardSequenceTemplate(),
  createThreeViewToCharacterTemplate(),
  createCharacterSheetTemplate(),
  createVideoContinuityTemplate(),
  createDualStyleTemplate(),
  createBasicStoryboardTemplate(),
  createThreeShotTemplate(),
  createImageToMotionTemplate(),
]
