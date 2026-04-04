import type {
  AppNode,
  ImageDisplayNodeData,
  ImageGenNodeData,
  ShotNodeData,
  VideoDisplayNodeData,
  VideoGenNodeData,
} from '../types'
import { createZipBlob, encodeTextFile } from '../utils/zip'

interface ExportAsset {
  nodeId: string
  nodeType: AppNode['type']
  nodeLabel: string
  url: string
  suggestedName: string
}

const extensionByMimeType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
}

function replaceUnsafeFileChars(value: string): string {
  return Array.from(value, (char) => {
    const charCode = char.charCodeAt(0)
    if (charCode <= 31 || '<>:"/\\|?*'.includes(char)) {
      return '-'
    }

    return char
  }).join('')
}

function sanitizeFilePart(value: string): string {
  return replaceUnsafeFileChars(value.trim())
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'asset'
}

function inferExtension(url: string, mimeType: string): string {
  if (extensionByMimeType[mimeType]) {
    return extensionByMimeType[mimeType]
  }

  try {
    const parsedUrl = new URL(url, window.location.origin)
    const path = parsedUrl.pathname
    const match = path.match(/\.([a-z0-9]{2,5})$/i)
    if (match) {
      return match[1].toLowerCase()
    }
  } catch {
    const match = url.match(/\.([a-z0-9]{2,5})(?:$|\?)/i)
    if (match) {
      return match[1].toLowerCase()
    }
  }

  return mimeType.startsWith('video/') ? 'mp4' : 'jpg'
}

function pushAsset(assets: ExportAsset[], seenUrls: Set<string>, asset: ExportAsset | null): void {
  if (!asset || !asset.url || seenUrls.has(asset.url)) {
    return
  }

  seenUrls.add(asset.url)
  assets.push(asset)
}

function createExportAssets(nodes: AppNode[]): ExportAsset[] {
  const assets: ExportAsset[] = []
  const seenUrls = new Set<string>()

  nodes.forEach((node) => {
    if (node.type === 'imageDisplay') {
      const data = node.data as ImageDisplayNodeData
      data.images.forEach((url, index) => {
        pushAsset(assets, seenUrls, {
          nodeId: node.id,
          nodeType: node.type,
          nodeLabel: data.label,
          url,
          suggestedName: `${sanitizeFilePart(data.label)}-${String(index + 1).padStart(2, '0')}`,
        })
      })
      return
    }

    if (node.type === 'imageGen') {
      const data = node.data as ImageGenNodeData
      pushAsset(
        assets,
        seenUrls,
        data.outputImage
          ? {
              nodeId: node.id,
              nodeType: node.type,
              nodeLabel: data.label,
              url: data.outputImage,
              suggestedName: `${sanitizeFilePart(data.label)}-output`,
            }
          : null
      )
      return
    }

    if (node.type === 'videoDisplay') {
      const data = node.data as VideoDisplayNodeData
      data.videos.forEach((url, index) => {
        pushAsset(assets, seenUrls, {
          nodeId: node.id,
          nodeType: node.type,
          nodeLabel: data.label,
          url,
          suggestedName: `${sanitizeFilePart(data.label)}-${String(index + 1).padStart(2, '0')}`,
        })
      })
      return
    }

    if (node.type === 'videoGen') {
      const data = node.data as VideoGenNodeData
      pushAsset(
        assets,
        seenUrls,
        data.outputVideo
          ? {
              nodeId: node.id,
              nodeType: node.type,
              nodeLabel: data.label,
              url: data.outputVideo,
              suggestedName: `${sanitizeFilePart(data.label)}-output`,
            }
          : null
      )
      return
    }

    if (node.type === 'shot') {
      const data = node.data as ShotNodeData
      const outputUrl = data.outputType === 'video' ? data.outputVideo : data.outputImage

      pushAsset(
        assets,
        seenUrls,
        outputUrl
          ? {
              nodeId: node.id,
              nodeType: node.type,
              nodeLabel: data.label,
              url: outputUrl,
              suggestedName: `${sanitizeFilePart(data.title || data.label)}-output`,
            }
          : null
      )
    }
  })

  return assets
}

async function fetchAssetBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`资源下载失败: ${response.status}`)
  }

  return response.blob()
}

function triggerBrowserDownload(fileName: string, blob: Blob): void {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()

  setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 1000)
}

export async function exportWorkflowAssetsAsZip(
  workflowName: string,
  nodes: AppNode[]
): Promise<{ assetCount: number; fileName: string }> {
  const assets = createExportAssets(nodes)
  if (assets.length === 0) {
    throw new Error('当前工作流还没有可导出的图片或视频结果')
  }

  const fileEntries = await Promise.all(
    assets.map(async (asset, index) => {
      const blob = await fetchAssetBlob(asset.url)
      const extension = inferExtension(asset.url, blob.type)
      const buffer = await blob.arrayBuffer()

      return {
        nodeId: asset.nodeId,
        nodeType: asset.nodeType,
        nodeLabel: asset.nodeLabel,
        fileName: `assets/${String(index + 1).padStart(2, '0')}-${asset.suggestedName}.${extension}`,
        data: new Uint8Array(buffer),
        mimeType: blob.type || 'application/octet-stream',
        originalUrl: asset.url,
      }
    })
  )

  const manifest = {
    workflowName,
    exportedAt: new Date().toISOString(),
    assetCount: fileEntries.length,
    assets: fileEntries.map((entry) => ({
      fileName: entry.fileName,
      nodeId: entry.nodeId,
      nodeType: entry.nodeType,
      nodeLabel: entry.nodeLabel,
      mimeType: entry.mimeType,
      originalUrl: entry.originalUrl,
    })),
  }

  const zipBlob = createZipBlob([
    ...fileEntries.map((entry) => ({
      name: entry.fileName,
      data: entry.data,
    })),
    {
      name: 'manifest.json',
      data: encodeTextFile(JSON.stringify(manifest, null, 2)),
    },
  ])

  const zipFileName = `${sanitizeFilePart(workflowName || 'workflow-export')}.zip`
  triggerBrowserDownload(zipFileName, zipBlob)

  return {
    assetCount: fileEntries.length,
    fileName: zipFileName,
  }
}
