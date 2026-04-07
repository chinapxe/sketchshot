import { CAMERA_ANGLE_OPTIONS, SHOT_SIZE_OPTIONS, getOptionLabel } from '../config/storyboardPresets'
import type {
  AppEdge,
  AppNode,
  CharacterNodeData,
  ContinuityNodeData,
  SceneNodeData,
  ShotOutputType,
  ShotNodeData,
  StyleNodeData,
  ThreeViewGenNodeData,
} from '../types'
import {
  THREE_VIEW_SLOT_KEYS,
  THREE_VIEW_SLOT_LABELS,
  getThreeViewOutputEntries,
  getThreeViewSlotFromHandleId,
} from './threeView'

function compactText(value: string | undefined): string {
  return (value ?? '').trim()
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)))
}

function isNodeDisabled(node: AppNode): boolean {
  return (node.data as Record<string, unknown>).disabled === true
}

function sortNodesByPosition(a: AppNode, b: AppNode): number {
  if (a.position.y !== b.position.y) return a.position.y - b.position.y
  return a.position.x - b.position.x
}

function buildIncomingEdgeMap(edges: AppEdge[]): Map<string, AppEdge[]> {
  const incoming = new Map<string, AppEdge[]>()

  edges.forEach((edge) => {
    const bucket = incoming.get(edge.target) ?? []
    bucket.push(edge)
    incoming.set(edge.target, bucket)
  })

  return incoming
}

function getIncomingNodes(
  nodeId: string,
  nodeMap: Map<string, AppNode>,
  incomingEdgeMap: Map<string, AppEdge[]>
): AppNode[] {
  const seen = new Set<string>()

  return (incomingEdgeMap.get(nodeId) ?? [])
    .map((edge) => nodeMap.get(edge.source))
    .filter((node): node is AppNode => {
      if (!node || isNodeDisabled(node) || seen.has(node.id)) {
        return false
      }

      seen.add(node.id)
      return true
    })
    .sort(sortNodesByPosition)
}

function joinNonEmpty(parts: string[], separator = '，'): string {
  return parts.filter((part) => part.length > 0).join(separator)
}

function formatDetail(label: string, values: string[]): string {
  const normalizedValues = dedupeStrings(values)
  return normalizedValues.length > 0 ? `${label}：${normalizedValues.join('、')}` : ''
}

function getShotSizeLabel(value: string | undefined): string {
  if (value === 'establishing') {
    return '大全景'
  }

  return getOptionLabel(SHOT_SIZE_OPTIONS, value)
}

function getCameraAngleLabel(value: string | undefined): string {
  return getOptionLabel(CAMERA_ANGLE_OPTIONS, value)
}

export interface ShotReferenceAsset {
  url: string
  title: string
  sourceNodeId: string
  sourceNodeType: AppNode['type']
  relation: string
}

function createReferenceAssetKey(url: string, sourceNodeId: string, relation: string): string {
  return `${url}::${sourceNodeId}::${relation}`
}

function collectCharacterThreeViewReferenceAssets(
  nodeId: string,
  sourceNodeType: AppNode['type'],
  baseTitle: string,
  threeViewImages: CharacterNodeData['threeViewImages']
): ShotReferenceAsset[] {
  return THREE_VIEW_SLOT_KEYS.map((slot) => {
    const url = threeViewImages?.[slot]
    if (!url) {
      return null
    }

    const slotLabel = THREE_VIEW_SLOT_LABELS[slot]

    return {
      url,
      title: `${baseTitle} ${slotLabel}`,
      sourceNodeId: nodeId,
      sourceNodeType,
      relation: `角色${slotLabel}`,
    }
  }).filter((asset): asset is ShotReferenceAsset => asset !== null)
}

function collectNodeReferenceAssets(node: AppNode, sourceHandle?: string | null): ShotReferenceAsset[] {
  if (node.type === 'imageUpload') {
    const imageUrl = typeof node.data.imageUrl === 'string' ? node.data.imageUrl : ''
    const fileName = typeof node.data.fileName === 'string' ? node.data.fileName : ''
    return imageUrl
      ? [
          {
            url: imageUrl,
            title: compactText(fileName) || compactText(node.data.label) || '上传源图',
            sourceNodeId: node.id,
            sourceNodeType: node.type,
            relation: '上传源图',
          },
        ]
      : []
  }

  if (node.type === 'imageGen') {
    const outputImage = typeof node.data.outputImage === 'string' ? node.data.outputImage : ''
    return outputImage
      ? [
          {
            url: outputImage,
            title: compactText(node.data.label) || '图片结果',
            sourceNodeId: node.id,
            sourceNodeType: node.type,
            relation: '图片结果',
          },
        ]
      : []
  }

  if (node.type === 'threeViewGen') {
    const data = node.data as ThreeViewGenNodeData
    const slot = getThreeViewSlotFromHandleId(sourceHandle)
    return getThreeViewOutputEntries(data).filter((entry) => !slot || entry.key === slot).map((entry) => ({
      url: entry.url,
      title: `${compactText(data.label) || '三视图生成'} ${entry.label}`,
      sourceNodeId: node.id,
      sourceNodeType: node.type,
      relation: entry.label,
    }))

    return data.outputImage
      ? [
          {
            url: data.outputImage ?? '',
            title: compactText(data.label) || '三视图拼板',
            sourceNodeId: node.id,
            sourceNodeType: node.type,
            relation: '三视图拼板',
          },
        ]
      : []
  }

  if (node.type === 'character') {
    const data = node.data as CharacterNodeData
    const baseTitle = compactText(data.name) || compactText(data.label) || '角色'

    const threeViewAssets = collectCharacterThreeViewReferenceAssets(node.id, node.type, baseTitle, data.threeViewImages)
    const usedThreeViewUrls = new Set(threeViewAssets.map((asset) => asset.url))

    return [
      ...threeViewAssets,
      ...dedupeStrings(data.referenceImages ?? [])
        .filter((url) => !usedThreeViewUrls.has(url))
        .map((url, index) => ({
        url,
        title: `${baseTitle} 参考 ${index + 1}`,
        sourceNodeId: node.id,
        sourceNodeType: node.type,
        relation: '角色参考',
      })),
      ...(data.threeViewSheetImage
        ? [
            {
              url: data.threeViewSheetImage,
              title: `${baseTitle} 三视图总览`,
              sourceNodeId: node.id,
              sourceNodeType: node.type,
              relation: '角色三视图总览',
            },
          ]
        : []),
    ]
  }

  if (node.type === 'continuity') {
    const data = node.data as ContinuityNodeData
    return data.outputImage
      ? [
          {
            url: data.outputImage,
            title: compactText(data.label) || '九宫格预览图',
            sourceNodeId: node.id,
            sourceNodeType: node.type,
            relation: '九宫格预览图',
          },
        ]
      : []
  }

  if (node.type === 'shot') {
    const data = node.data as ShotNodeData
    return data.outputType === 'image' && data.outputImage
      ? [
          {
            url: data.outputImage,
            title: compactText(data.title) || compactText(data.label) || '镜头结果',
            sourceNodeId: node.id,
            sourceNodeType: node.type,
            relation: '上游镜头结果',
          },
        ]
      : []
  }

  return []
}

function dedupeReferenceAssets(assets: ShotReferenceAsset[]): ShotReferenceAsset[] {
  const seen = new Set<string>()

  return assets.filter((asset) => {
    const key = createReferenceAssetKey(asset.url, asset.sourceNodeId, asset.relation)
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

function collectRecursiveReferenceAssets(
  nodeId: string,
  nodeMap: Map<string, AppNode>,
  incomingEdgeMap: Map<string, AppEdge[]>,
  visited: Set<string>
): ShotReferenceAsset[] {
  if (visited.has(nodeId)) {
    return []
  }

  visited.add(nodeId)

  const incomingEdges = incomingEdgeMap.get(nodeId) ?? []
  const assets: ShotReferenceAsset[] = []

  incomingEdges.forEach((edge) => {
    const sourceNode = nodeMap.get(edge.source)
    if (!sourceNode || isNodeDisabled(sourceNode)) {
      return
    }

    assets.push(...collectNodeReferenceAssets(sourceNode, edge.sourceHandle))
    assets.push(...collectRecursiveReferenceAssets(edge.source, nodeMap, incomingEdgeMap, visited))
  })

  return dedupeReferenceAssets(assets)
}

export interface ShotContextScene {
  id: string
  title: string
  synopsis: string
  beat: string
}

export interface ShotContextCharacter {
  id: string
  name: string
  role: string
  appearance: string
  temperamentTags: string[]
  stateTags: string[]
  wardrobe: string
  props: string
  notes: string
}

export interface ShotContextStyle {
  id: string
  name: string
  keywords: string
  palette: string
  lighting: string
  framing: string
  styleTags: string[]
  paletteTags: string[]
  lightingTags: string[]
  framingTags: string[]
  qualityTags: string[]
  notes: string
}

export interface ShotContextPreviousShot {
  id: string
  title: string
  description: string
  outputType: ShotOutputType
}

export interface ShotContextContinuity {
  id: string
  label: string
  frames: string[]
}

export interface ShotContext {
  scenes: ShotContextScene[]
  characters: ShotContextCharacter[]
  styles: ShotContextStyle[]
  previousShots: ShotContextPreviousShot[]
  continuity: ShotContextContinuity | null
  continuityCount: number
  referenceAssets: ShotReferenceAsset[]
  referenceImages: string[]
  contextSignature: string
}

export interface ContinuityContext {
  scenes: ShotContextScene[]
  characters: ShotContextCharacter[]
  styles: ShotContextStyle[]
  referenceAssets: ShotReferenceAsset[]
  referenceImages: string[]
  contextSignature: string
}

function normalizeFrameGrid(value: unknown): string[] {
  return Array.from({ length: 9 }, (_, index) => {
    const frame = Array.isArray(value) ? value[index] : undefined
    return typeof frame === 'string' ? frame : ''
  })
}

export function getShotContext(nodeId: string, nodes: AppNode[], edges: AppEdge[]): ShotContext {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const incomingEdgeMap = buildIncomingEdgeMap(edges)
  const incomingNodes = getIncomingNodes(nodeId, nodeMap, incomingEdgeMap)

  const scenes = incomingNodes
    .filter((node): node is Extract<AppNode, { type: 'scene' }> => node.type === 'scene')
    .map((node) => {
      const data = node.data as SceneNodeData
      return {
        id: node.id,
        title: compactText(data.title) || compactText(data.label),
        synopsis: compactText(data.synopsis),
        beat: compactText(data.beat),
      }
    })

  const characters = incomingNodes
    .filter((node): node is Extract<AppNode, { type: 'character' }> => node.type === 'character')
    .map((node) => {
      const data = node.data as CharacterNodeData
      return {
        id: node.id,
        name: compactText(data.name) || compactText(data.label),
        role: compactText(data.role),
        appearance: compactText(data.appearance),
        temperamentTags: dedupeStrings(data.temperamentTags ?? []),
        stateTags: dedupeStrings(data.stateTags ?? []),
        wardrobe: compactText(data.wardrobe),
        props: compactText(data.props),
        notes: compactText(data.notes),
      }
    })

  const styles = incomingNodes
    .filter((node): node is Extract<AppNode, { type: 'style' }> => node.type === 'style')
    .map((node) => {
      const data = node.data as StyleNodeData
      return {
        id: node.id,
        name: compactText(data.name) || compactText(data.label),
        keywords: compactText(data.keywords),
        palette: compactText(data.palette),
        lighting: compactText(data.lighting),
        framing: compactText(data.framing),
        styleTags: dedupeStrings(data.styleTags ?? []),
        paletteTags: dedupeStrings(data.paletteTags ?? []),
        lightingTags: dedupeStrings(data.lightingTags ?? []),
        framingTags: dedupeStrings(data.framingTags ?? []),
        qualityTags: dedupeStrings(data.qualityTags ?? []),
        notes: compactText(data.notes),
      }
    })

  const previousShots = incomingNodes
    .filter((node): node is Extract<AppNode, { type: 'shot' }> => node.type === 'shot')
    .map((node) => {
      const data = node.data as ShotNodeData
      return {
        id: node.id,
        title: compactText(data.title) || compactText(data.label),
        description: compactText(data.description) || compactText(data.prompt),
        outputType: data.outputType ?? 'image',
      }
    })

  const continuityNodes = incomingNodes
    .filter((node): node is Extract<AppNode, { type: 'continuity' }> => node.type === 'continuity')
    .map((node) => {
      const data = node.data as ContinuityNodeData
      return {
        id: node.id,
        label: compactText(data.label) || '九宫格动作',
        frames: normalizeFrameGrid(data.frames),
      }
    })

  const directThreeViewAssets = incomingNodes
    .filter((node): node is Extract<AppNode, { type: 'threeViewGen' }> => node.type === 'threeViewGen')
    .flatMap((node) => {
      const data = node.data as ThreeViewGenNodeData
      return getThreeViewOutputEntries(data).map((entry) => ({
        url: entry.url,
        title: `${compactText(data.label) || '三视图生成'} ${entry.label}`,
        sourceNodeId: node.id,
        sourceNodeType: node.type,
        relation: entry.label,
      }))
    })

  const directCharacterGeneratedAssets = incomingNodes
    .filter((node): node is Extract<AppNode, { type: 'character' }> => node.type === 'character')
    .flatMap((node) => {
      const data = node.data as CharacterNodeData
      const baseTitle = compactText(data.name) || compactText(data.label) || '角色'

      return (['front', 'side', 'back'] as const)
        .map((slot) => {
          const url = data.generatedThreeViewImages?.[slot]
          if (!url) {
            return null
          }

          const label = slot === 'front' ? '生成正面' : slot === 'side' ? '生成侧面' : '生成背面'
          return {
            url,
            title: `${baseTitle} ${label}`,
            sourceNodeId: node.id,
            sourceNodeType: node.type,
            relation: label,
          }
        })
        .filter(Boolean) as ShotReferenceAsset[]
    })

  void directThreeViewAssets
  void directCharacterGeneratedAssets
  const referenceAssets = collectRecursiveReferenceAssets(nodeId, nodeMap, incomingEdgeMap, new Set<string>())
  const referenceImages = dedupeStrings(referenceAssets.map((asset) => asset.url))
  const continuity = continuityNodes[0] ?? null

  return {
    scenes,
    characters,
    styles,
    previousShots,
    continuity,
    continuityCount: continuityNodes.length,
    referenceAssets,
    referenceImages,
    contextSignature: JSON.stringify({
      scenes,
      characters,
      styles,
      previousShots,
      continuity,
      continuityCount: continuityNodes.length,
      referenceImages,
    }),
  }
}

export function getContinuityContext(nodeId: string, nodes: AppNode[], edges: AppEdge[]): ContinuityContext {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const incomingEdgeMap = buildIncomingEdgeMap(edges)
  const incomingNodes = getIncomingNodes(nodeId, nodeMap, incomingEdgeMap)

  const scenes = incomingNodes
    .filter((node): node is Extract<AppNode, { type: 'scene' }> => node.type === 'scene')
    .map((node) => {
      const data = node.data as SceneNodeData
      return {
        id: node.id,
        title: compactText(data.title) || compactText(data.label),
        synopsis: compactText(data.synopsis),
        beat: compactText(data.beat),
      }
    })

  const characters = incomingNodes
    .filter((node): node is Extract<AppNode, { type: 'character' }> => node.type === 'character')
    .map((node) => {
      const data = node.data as CharacterNodeData
      return {
        id: node.id,
        name: compactText(data.name) || compactText(data.label),
        role: compactText(data.role),
        appearance: compactText(data.appearance),
        temperamentTags: dedupeStrings(data.temperamentTags ?? []),
        stateTags: dedupeStrings(data.stateTags ?? []),
        wardrobe: compactText(data.wardrobe),
        props: compactText(data.props),
        notes: compactText(data.notes),
      }
    })

  const styles = incomingNodes
    .filter((node): node is Extract<AppNode, { type: 'style' }> => node.type === 'style')
    .map((node) => {
      const data = node.data as StyleNodeData
      return {
        id: node.id,
        name: compactText(data.name) || compactText(data.label),
        keywords: compactText(data.keywords),
        palette: compactText(data.palette),
        lighting: compactText(data.lighting),
        framing: compactText(data.framing),
        styleTags: dedupeStrings(data.styleTags ?? []),
        paletteTags: dedupeStrings(data.paletteTags ?? []),
        lightingTags: dedupeStrings(data.lightingTags ?? []),
        framingTags: dedupeStrings(data.framingTags ?? []),
        qualityTags: dedupeStrings(data.qualityTags ?? []),
        notes: compactText(data.notes),
      }
    })

  const directThreeViewAssets = incomingNodes
    .filter((node): node is Extract<AppNode, { type: 'threeViewGen' }> => node.type === 'threeViewGen')
    .flatMap((node) => {
      const data = node.data as ThreeViewGenNodeData
      return getThreeViewOutputEntries(data).map((entry) => ({
        url: entry.url,
        title: `${compactText(data.label) || '三视图生成'} ${entry.label}`,
        sourceNodeId: node.id,
        sourceNodeType: node.type,
        relation: entry.label,
      }))
    })

  const directCharacterGeneratedAssets = incomingNodes
    .filter((node): node is Extract<AppNode, { type: 'character' }> => node.type === 'character')
    .flatMap((node) => {
      const data = node.data as CharacterNodeData
      const baseTitle = compactText(data.name) || compactText(data.label) || '角色'

      return (['front', 'side', 'back'] as const)
        .map((slot) => {
          const url = data.generatedThreeViewImages?.[slot]
          if (!url) {
            return null
          }

          const label = slot === 'front' ? '生成正面' : slot === 'side' ? '生成侧面' : '生成背面'
          return {
            url,
            title: `${baseTitle} ${label}`,
            sourceNodeId: node.id,
            sourceNodeType: node.type,
            relation: label,
          }
        })
        .filter(Boolean) as ShotReferenceAsset[]
    })

  void directThreeViewAssets
  void directCharacterGeneratedAssets
  const referenceAssets = collectRecursiveReferenceAssets(nodeId, nodeMap, incomingEdgeMap, new Set<string>())
  const referenceImages = dedupeStrings(referenceAssets.map((asset) => asset.url))

  return {
    scenes,
    characters,
    styles,
    referenceAssets,
    referenceImages,
    contextSignature: JSON.stringify({
      scenes,
      characters,
      styles,
      referenceImages,
    }),
  }
}

export function resolveShotContinuityFrames(data: ShotNodeData, context: ShotContext): string[] {
  const contextFrames = context.continuity?.frames ?? []
  const hasContextFrames = contextFrames.some((frame) => frame.trim().length > 0)

  if (hasContextFrames) {
    return contextFrames
  }

  return normalizeFrameGrid(data.continuityFrames)
}

function summarizeScene(scene: ShotContextScene): string {
  return joinNonEmpty([scene.title, scene.synopsis, scene.beat], '；')
}

function summarizeCharacter(character: ShotContextCharacter): string {
  return joinNonEmpty(
    [
      character.name,
      character.role,
      character.appearance,
      formatDetail('气质', character.temperamentTags),
      formatDetail('状态', character.stateTags),
      character.wardrobe,
      character.props,
      character.notes,
    ],
    '，'
  )
}

function summarizeStyle(style: ShotContextStyle): string {
  return joinNonEmpty(
    [
      style.name,
      formatDetail('风格', [...style.styleTags, style.keywords]),
      formatDetail('色彩', [...style.paletteTags, style.palette]),
      formatDetail('光线', [...style.lightingTags, style.lighting]),
      formatDetail('构图', [...style.framingTags, style.framing]),
      formatDetail('质感', style.qualityTags),
      style.notes ? `备注：${style.notes}` : '',
    ],
    '；'
  )
}

function summarizePreviousShot(shot: ShotContextPreviousShot): string {
  return joinNonEmpty(
    [shot.title, shot.description, shot.outputType === 'video' ? '上游为视频镜头' : '上游为图像镜头'],
    '；'
  )
}

function resolveReferenceAssetTitle(url: string | undefined, referenceAssets: ShotReferenceAsset[]): string {
  if (!url) return ''

  const asset = referenceAssets.find((item) => item.url === url)
  return asset ? `${asset.title}（${asset.relation}）` : url
}

export function getShotVideoSourceImages(data: ShotNodeData, context: ShotContext): string[] {
  const availableImages = new Set(context.referenceImages)
  const videoFirstFrame = data.videoFirstFrame && availableImages.has(data.videoFirstFrame) ? data.videoFirstFrame : undefined
  const videoLastFrame = data.videoLastFrame && availableImages.has(data.videoLastFrame) ? data.videoLastFrame : undefined

  if (videoFirstFrame && videoLastFrame) {
    return videoFirstFrame === videoLastFrame ? [videoFirstFrame] : [videoFirstFrame, videoLastFrame]
  }

  if (videoFirstFrame) {
    return [videoFirstFrame]
  }

  if (videoLastFrame) {
    return [videoLastFrame]
  }

  return context.referenceImages
}

export function buildShotPrompt(data: ShotNodeData, context: ShotContext): string {
  const sections: string[] = []
  const continuityFrames = resolveShotContinuityFrames(data, context)
    .map((frame, index) => ({
      index,
      text: compactText(frame),
    }))
    .filter((frame) => frame.text.length > 0)

  const shotSummary = joinNonEmpty(
    [
      compactText(data.title),
      compactText(data.description),
      data.shotSize ? `景别：${getShotSizeLabel(data.shotSize)}` : '',
      data.cameraAngle ? `机位：${getCameraAngleLabel(data.cameraAngle)}` : '',
      compactText(data.cameraMovement) ? `运镜：${compactText(data.cameraMovement)}` : '',
      compactText(data.composition) ? `构图：${compactText(data.composition)}` : '',
      compactText(data.lightingStyle) ? `光线：${compactText(data.lightingStyle)}` : '',
      data.moodTags && data.moodTags.length > 0 ? `氛围：${dedupeStrings(data.moodTags).join('、')}` : '',
      data.qualityTags && data.qualityTags.length > 0 ? `质感：${dedupeStrings(data.qualityTags).join('、')}` : '',
      compactText(data.motion) ? `动作：${compactText(data.motion)}` : '',
      compactText(data.emotion) ? `情绪：${compactText(data.emotion)}` : '',
    ],
    '；'
  )

  if (context.scenes.length > 0) {
    sections.push(`场次上下文：${context.scenes.map(summarizeScene).join(' | ')}`)
  }

  if (context.characters.length > 0) {
    sections.push(`角色设定：${context.characters.map(summarizeCharacter).join(' | ')}`)
  }

  if (context.styles.length > 0) {
    sections.push(`风格设定：${context.styles.map(summarizeStyle).join(' | ')}`)
  }

  if (context.previousShots.length > 0) {
    sections.push(`承接镜头：${context.previousShots.map(summarizePreviousShot).join(' | ')}`)
  }

  if (shotSummary) {
    sections.push(`镜头要求：${shotSummary}`)
  }

  if (compactText(data.prompt)) {
    sections.push(`补充提示：${compactText(data.prompt)}`)
  }

  if (data.outputType === 'video' && data.videoFirstFrame) {
    sections.push(`首帧约束：${resolveReferenceAssetTitle(data.videoFirstFrame, context.referenceAssets)}`)
  }

  if (data.outputType === 'video' && data.videoLastFrame) {
    sections.push(`尾帧约束：${resolveReferenceAssetTitle(data.videoLastFrame, context.referenceAssets)}`)
  }

  if (data.outputType === 'video' && continuityFrames.length > 0) {
    sections.push(
      `九宫格连续动作：${continuityFrames.map((frame) => `${frame.index + 1}. ${frame.text}`).join(' | ')}`
    )
  }

  return sections.join('\n')
}
