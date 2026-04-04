import type { AppNode, ShotNodeData, VideoGenNodeData } from '../types'

export type AssetCenterCategory = 'upload' | 'reference' | 'generated'
export type AssetCenterAssetType = 'image' | 'video'

export interface AssetCenterSource {
  nodeId: string
  nodeType: AppNode['type']
  nodeLabel: string
  relation: string
}

export interface AssetCenterEntry {
  key: string
  url: string
  assetType: AssetCenterAssetType
  category: AssetCenterCategory
  title: string
  sources: AssetCenterSource[]
}

function sortNodesByPosition(a: AppNode, b: AppNode): number {
  if (a.position.y !== b.position.y) return a.position.y - b.position.y
  return a.position.x - b.position.x
}

function compactText(value: string | undefined): string {
  return (value ?? '').trim()
}

function categoryPriority(category: AssetCenterCategory): number {
  switch (category) {
    case 'generated':
      return 3
    case 'upload':
      return 2
    default:
      return 1
  }
}

function chooseTitle(entryTitle: string, candidateTitle: string, currentCategory: AssetCenterCategory, nextCategory: AssetCenterCategory): string {
  if (!entryTitle) return candidateTitle
  if (categoryPriority(nextCategory) > categoryPriority(currentCategory)) return candidateTitle
  return entryTitle
}

function pushAsset(
  assetMap: Map<string, AssetCenterEntry>,
  params: {
    url?: string
    assetType: AssetCenterAssetType
    category: AssetCenterCategory
    title: string
    source: AssetCenterSource
  }
): void {
  if (!params.url) return

  const current = assetMap.get(params.url)
  if (!current) {
    assetMap.set(params.url, {
      key: params.url,
      url: params.url,
      assetType: params.assetType,
      category: params.category,
      title: params.title,
      sources: [params.source],
    })
    return
  }

  const sourceExists = current.sources.some(
    (source) => source.nodeId === params.source.nodeId && source.relation === params.source.relation
  )

  if (!sourceExists) {
    current.sources.push(params.source)
  }

  current.title = chooseTitle(current.title, params.title, current.category, params.category)
  if (categoryPriority(params.category) > categoryPriority(current.category)) {
    current.category = params.category
  }
}

function labelForNode(node: AppNode): string {
  if (node.type === 'shot') {
    const data = node.data as ShotNodeData
    return compactText(data.title) || compactText(data.label) || '镜头'
  }

  if (node.type === 'character') {
    return compactText(node.data.name) || compactText(node.data.label) || '角色'
  }

  return compactText((node.data as { label?: string }).label) || node.type
}

export function getAssetCenterEntries(nodes: AppNode[]): AssetCenterEntry[] {
  const assetMap = new Map<string, AssetCenterEntry>()

  nodes
    .slice()
    .sort(sortNodesByPosition)
    .forEach((node) => {
      const sourceLabel = labelForNode(node)

      if (node.type === 'imageUpload') {
        pushAsset(assetMap, {
          url: node.data.imageUrl,
          assetType: 'image',
          category: 'upload',
          title: compactText(node.data.fileName) || sourceLabel,
          source: {
            nodeId: node.id,
            nodeType: node.type,
            nodeLabel: sourceLabel,
            relation: '上传源图',
          },
        })
        return
      }

      if (node.type === 'character') {
        ;(node.data.referenceImages ?? []).forEach((url) => {
          pushAsset(assetMap, {
            url,
            assetType: 'image',
            category: 'reference',
            title: `${sourceLabel} 参考`,
            source: {
              nodeId: node.id,
              nodeType: node.type,
              nodeLabel: sourceLabel,
              relation: '角色参考',
            },
          })
        })
        return
      }

      if (node.type === 'imageGen') {
        ;(node.data.referenceImages ?? []).forEach((url) => {
          pushAsset(assetMap, {
            url,
            assetType: 'image',
            category: 'reference',
            title: `${sourceLabel} 参考`,
            source: {
              nodeId: node.id,
              nodeType: node.type,
              nodeLabel: sourceLabel,
              relation: '图片参考',
            },
          })
        })

        pushAsset(assetMap, {
          url: node.data.outputImage,
          assetType: 'image',
          category: 'generated',
          title: sourceLabel,
          source: {
            nodeId: node.id,
            nodeType: node.type,
            nodeLabel: sourceLabel,
            relation: '图片结果',
          },
        })
        return
      }

      if (node.type === 'videoGen') {
        const data = node.data as VideoGenNodeData

        ;(data.sourceImages ?? []).forEach((url) => {
          pushAsset(assetMap, {
            url,
            assetType: 'image',
            category: 'reference',
            title: `${sourceLabel} 参考`,
            source: {
              nodeId: node.id,
              nodeType: node.type,
              nodeLabel: sourceLabel,
              relation: '视频源图',
            },
          })
        })

        pushAsset(assetMap, {
          url: data.outputVideo,
          assetType: 'video',
          category: 'generated',
          title: sourceLabel,
          source: {
            nodeId: node.id,
            nodeType: node.type,
            nodeLabel: sourceLabel,
            relation: '视频结果',
          },
        })
        return
      }

      if (node.type === 'shot') {
        const data = node.data as ShotNodeData

        ;(data.referenceImages ?? []).forEach((url) => {
          pushAsset(assetMap, {
            url,
            assetType: 'image',
            category: 'reference',
            title: `${sourceLabel} 参考`,
            source: {
              nodeId: node.id,
              nodeType: node.type,
              nodeLabel: sourceLabel,
              relation: '镜头参考',
            },
          })
        })

        pushAsset(assetMap, {
          url: data.outputType === 'video' ? data.outputVideo : data.outputImage,
          assetType: data.outputType,
          category: 'generated',
          title: sourceLabel,
          source: {
            nodeId: node.id,
            nodeType: node.type,
            nodeLabel: sourceLabel,
            relation: data.outputType === 'video' ? '镜头视频结果' : '镜头图像结果',
          },
        })
      }
    })

  return Array.from(assetMap.values())
}
