import type {
  AppEdge,
  AppNode,
  CharacterNodeData,
  SceneNodeData,
  ShotOutputType,
  ShotNodeData,
  StyleNodeData,
} from '../types'

function compactText(value: string | undefined): string {
  return (value ?? '').trim()
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)))
}

function isNodeDisabled(node: AppNode): boolean {
  return (node.data as Record<string, unknown>).disabled === true
}

function sortNodesByPosition(a: AppNode, b: AppNode): number {
  if (a.position.y !== b.position.y) return a.position.y - b.position.y
  return a.position.x - b.position.x
}

function buildIncomingNodeMap(edges: AppEdge[]): Map<string, string[]> {
  const incoming = new Map<string, string[]>()

  edges.forEach((edge) => {
    const bucket = incoming.get(edge.target) ?? []
    bucket.push(edge.source)
    incoming.set(edge.target, bucket)
  })

  return incoming
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

function collectNodeReferenceAssets(node: AppNode): ShotReferenceAsset[] {
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

  if (node.type === 'character') {
    const data = node.data as CharacterNodeData
    const baseTitle = compactText(data.name) || compactText(data.label) || '角色'

    return dedupeStrings(data.referenceImages ?? []).map((url, index) => ({
      url,
      title: `${baseTitle} 参考 ${index + 1}`,
      sourceNodeId: node.id,
      sourceNodeType: node.type,
      relation: '角色参考',
    }))
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
  incomingMap: Map<string, string[]>,
  visited: Set<string>
): ShotReferenceAsset[] {
  if (visited.has(nodeId)) {
    return []
  }

  visited.add(nodeId)

  const incomingNodeIds = incomingMap.get(nodeId) ?? []
  const assets: ShotReferenceAsset[] = []

  incomingNodeIds.forEach((sourceId) => {
    const sourceNode = nodeMap.get(sourceId)
    if (!sourceNode || isNodeDisabled(sourceNode)) {
      return
    }

    assets.push(...collectNodeReferenceAssets(sourceNode))
    assets.push(...collectRecursiveReferenceAssets(sourceId, nodeMap, incomingMap, visited))
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
  notes: string
}

export interface ShotContextPreviousShot {
  id: string
  title: string
  description: string
  outputType: ShotOutputType
}

export interface ShotContext {
  scenes: ShotContextScene[]
  characters: ShotContextCharacter[]
  styles: ShotContextStyle[]
  previousShots: ShotContextPreviousShot[]
  referenceAssets: ShotReferenceAsset[]
  referenceImages: string[]
  contextSignature: string
}

export function getShotContext(nodeId: string, nodes: AppNode[], edges: AppEdge[]): ShotContext {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const incomingMap = buildIncomingNodeMap(edges)
  const incomingNodes = (incomingMap.get(nodeId) ?? [])
    .map((sourceId) => nodeMap.get(sourceId))
    .filter((node): node is AppNode => {
      if (!node) return false
      return !isNodeDisabled(node)
    })
    .sort(sortNodesByPosition)

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

  const referenceAssets = collectRecursiveReferenceAssets(nodeId, nodeMap, incomingMap, new Set<string>())
  const referenceImages = referenceAssets.map((asset) => asset.url)

  return {
    scenes,
    characters,
    styles,
    previousShots,
    referenceAssets,
    referenceImages,
    contextSignature: JSON.stringify({
      scenes,
      characters,
      styles,
      previousShots,
      referenceImages,
    }),
  }
}

function joinNonEmpty(parts: string[], separator = '，'): string {
  return parts.filter((part) => part.length > 0).join(separator)
}

function summarizeScene(scene: ShotContextScene): string {
  return joinNonEmpty([scene.title, scene.synopsis, scene.beat], '；')
}

function summarizeCharacter(character: ShotContextCharacter): string {
  return joinNonEmpty(
    [character.name, character.role, character.appearance, character.wardrobe, character.props, character.notes],
    '，'
  )
}

function summarizeStyle(style: ShotContextStyle): string {
  return joinNonEmpty([style.name, style.keywords, style.palette, style.lighting, style.framing, style.notes], '，')
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
  const continuityFrames = (data.continuityFrames ?? [])
    .map((frame, index) => ({
      index,
      text: compactText(frame),
    }))
    .filter((frame) => frame.text.length > 0)

  const shotSummary = joinNonEmpty(
    [
      compactText(data.title),
      compactText(data.description),
      data.shotSize ? `景别：${data.shotSize}` : '',
      data.cameraAngle ? `机位：${data.cameraAngle}` : '',
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
