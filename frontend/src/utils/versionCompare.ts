import type { AppEdge, AppNode, ImageGenNodeData, ShotNodeData, VideoGenNodeData } from '../types'
import { getShotSequenceMap } from './shotSequences'

export interface NodeVersionAsset {
  key: string
  url: string
  label: string
  isCurrent: boolean
}

export interface VersionCompareEntry {
  nodeId: string
  nodeType: AppNode['type']
  title: string
  subtitle: string
  assetType: 'image' | 'video'
  versions: NodeVersionAsset[]
  currentAssetUrl?: string
  sequenceLabel?: string
  sequenceStep?: number
  sequenceLength?: number
}

function sortNodesByPosition(a: AppNode, b: AppNode): number {
  if (a.position.y !== b.position.y) return a.position.y - b.position.y
  return a.position.x - b.position.x
}

function compactText(value: string | undefined): string {
  return (value ?? '').trim()
}

function getNodeVersionSource(node: AppNode): {
  assetType?: 'image' | 'video'
  currentAssetUrl?: string
  cache?: Record<string, string>
  title: string
  subtitle: string
} {
  if (node.type === 'imageGen') {
    const data = node.data as ImageGenNodeData
    return {
      assetType: 'image',
      currentAssetUrl: data.outputImage,
      cache: data.resultCache,
      title: compactText(data.label) || '图片生成',
      subtitle: compactText(data.prompt) || '等待填写图片提示词',
    }
  }

  if (node.type === 'videoGen') {
    const data = node.data as VideoGenNodeData
    return {
      assetType: 'video',
      currentAssetUrl: data.outputVideo,
      cache: data.resultCache,
      title: compactText(data.label) || '视频生成',
      subtitle: compactText(data.prompt) || '等待填写视频提示词',
    }
  }

  if (node.type === 'shot') {
    const data = node.data as ShotNodeData
    return {
      assetType: data.outputType,
      currentAssetUrl: data.outputType === 'video' ? data.outputVideo : data.outputImage,
      cache: data.resultCache,
      title: compactText(data.title) || compactText(data.label) || '镜头',
      subtitle: compactText(data.description) || compactText(data.prompt) || '等待填写镜头描述',
    }
  }

  return {
    title: compactText((node.data as { label?: string }).label) || node.type,
    subtitle: '',
  }
}

export function getNodeVersionAssets(node: AppNode): {
  assetType?: 'image' | 'video'
  currentAssetUrl?: string
  versions: NodeVersionAsset[]
  title: string
  subtitle: string
} {
  const source = getNodeVersionSource(node)
  if (!source.assetType) {
    return {
      assetType: undefined,
      currentAssetUrl: undefined,
      versions: [],
      title: source.title,
      subtitle: source.subtitle,
    }
  }

  const urls = Array.from(new Set([
    ...(source.currentAssetUrl ? [source.currentAssetUrl] : []),
    ...Object.values(source.cache ?? {}),
  ].filter((url): url is string => typeof url === 'string' && url.length > 0)))

  let historyIndex = 1
  const versions = urls.map((url, index) => {
    const isCurrent = Boolean(source.currentAssetUrl) && url === source.currentAssetUrl

    return {
      key: `${node.id}-${index}-${url}`,
      url,
      label: isCurrent ? '当前版本' : `历史版本 ${historyIndex++}`,
      isCurrent,
    } satisfies NodeVersionAsset
  })

  return {
    assetType: source.assetType,
    currentAssetUrl: source.currentAssetUrl,
    versions,
    title: source.title,
    subtitle: source.subtitle,
  }
}

function isComparableNode(node: AppNode): boolean {
  return node.type === 'imageGen' || node.type === 'videoGen' || node.type === 'shot'
}

export function getVersionCompareEntries(nodes: AppNode[], edges: AppEdge[]): VersionCompareEntry[] {
  const sequenceMap = getShotSequenceMap(nodes, edges)
  const entries: VersionCompareEntry[] = []

  nodes
    .filter(isComparableNode)
    .sort(sortNodesByPosition)
    .forEach((node) => {
      const versions = getNodeVersionAssets(node)
      if (!versions.assetType || versions.versions.length < 2) {
        return
      }

      const sequenceInfo = node.type === 'shot' ? sequenceMap.get(node.id) : undefined

      entries.push({
        nodeId: node.id,
        nodeType: node.type,
        title: versions.title,
        subtitle: versions.subtitle,
        assetType: versions.assetType,
        versions: versions.versions,
        currentAssetUrl: versions.currentAssetUrl,
        sequenceLabel: sequenceInfo?.sequenceLabel,
        sequenceStep: sequenceInfo?.step,
        sequenceLength: sequenceInfo?.length,
      } satisfies VersionCompareEntry)
    })

  return entries
}
