import type { AppEdge, AppNode, NodeStatus, ShotNodeData, VideoGenNodeData } from '../types'
import { getShotSequenceMap } from './shotSequences'
import { getNodeVersionAssets } from './versionCompare'

export interface ExecutionCenterEntry {
  id: string
  nodeType: AppNode['type']
  title: string
  subtitle: string
  status: NodeStatus
  progress: number
  disabled: boolean
  errorMessage?: string
  assetType?: 'image' | 'video'
  assetUrl?: string
  sequenceLabel?: string
  sequenceStep?: number
  sequenceLength?: number
  versionCount: number
}

function sortNodesByPosition(a: AppNode, b: AppNode): number {
  if (a.position.y !== b.position.y) return a.position.y - b.position.y
  return a.position.x - b.position.x
}

function compactText(value: string | undefined): string {
  return (value ?? '').trim()
}

function isExecutableNode(node: AppNode): boolean {
  return node.type === 'imageGen' || node.type === 'videoGen' || node.type === 'shot'
}

export function getExecutionCenterEntries(nodes: AppNode[]): ExecutionCenterEntry[] {
  return getExecutionCenterEntriesWithEdges(nodes, [])
}

export function getExecutionCenterEntriesWithEdges(nodes: AppNode[], edges: AppEdge[]): ExecutionCenterEntry[] {
  const sequenceMap = getShotSequenceMap(nodes, edges)

  return nodes
    .filter(isExecutableNode)
    .sort(sortNodesByPosition)
    .map((node) => {
      const disabled = (node.data as Record<string, unknown>).disabled === true
      const versions = getNodeVersionAssets(node)

      if (node.type === 'imageGen') {
        return {
          id: node.id,
          nodeType: node.type,
          title: compactText(node.data.label) || '图片生成',
          subtitle: compactText(node.data.prompt) || '等待填写图片提示词',
          status: node.data.status,
          progress: node.data.progress,
          disabled,
          errorMessage: node.data.errorMessage,
          assetType: node.data.outputImage ? 'image' : undefined,
          assetUrl: node.data.outputImage,
          versionCount: versions.versions.length,
        } satisfies ExecutionCenterEntry
      }

      if (node.type === 'videoGen') {
        const data = node.data as VideoGenNodeData
        return {
          id: node.id,
          nodeType: node.type,
          title: compactText(data.label) || '视频生成',
          subtitle: compactText(data.prompt) || '等待填写视频提示词',
          status: data.status,
          progress: data.progress,
          disabled,
          errorMessage: data.errorMessage,
          assetType: data.outputVideo ? 'video' : undefined,
          assetUrl: data.outputVideo,
          versionCount: versions.versions.length,
        } satisfies ExecutionCenterEntry
      }

      const shotData = node.data as ShotNodeData
      const sequenceInfo = sequenceMap.get(node.id)
      return {
        id: node.id,
        nodeType: node.type,
        title: compactText(shotData.title) || compactText(shotData.label) || '镜头',
        subtitle: compactText(shotData.description) || compactText(shotData.prompt) || '等待填写镜头描述',
        status: shotData.status,
        progress: shotData.progress,
        disabled,
        errorMessage: shotData.errorMessage,
        assetType: shotData.outputType,
        assetUrl: shotData.outputType === 'video' ? shotData.outputVideo : shotData.outputImage,
        sequenceLabel: sequenceInfo?.sequenceLabel,
        sequenceStep: sequenceInfo?.step,
        sequenceLength: sequenceInfo?.length,
        versionCount: versions.versions.length,
      } satisfies ExecutionCenterEntry
    })
}
