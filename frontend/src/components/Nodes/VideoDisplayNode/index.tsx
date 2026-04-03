import { memo, useCallback, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { PlayCircleOutlined, UploadOutlined, VideoCameraOutlined } from '@ant-design/icons'

import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { VideoDisplayNode as VideoDisplayNodeType } from '../../../types'
import { getPreviewAssetType } from '../../../utils/media'
import './style.css'

const VideoDisplayNode = memo(({ id, data }: NodeProps<VideoDisplayNodeType>) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleOpenUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleOpenPreview = useCallback(
    (url: string, index: number) => {
      openPreview({
        type: getPreviewAssetType(url),
        src: url,
        title: `${data.label} - 结果 ${index + 1}`,
      })
    },
    [data.label, openPreview]
  )

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
      if (files.length === 0) return

      const urls = files.map((file) => {
        const objectUrl = URL.createObjectURL(file)
        return file.type.startsWith('video/') ? `${objectUrl}#video` : objectUrl
      })

      updateNodeData(id, {
        videos: [...data.videos, ...urls],
      })

      event.target.value = ''
    },
    [data.videos, id, updateNodeData]
  )

  const isDisabled = (data as Record<string, unknown>).disabled === true

  return (
    <div className={`video-display-node${isDisabled ? ' node-disabled' : ''}`}>
      <Handle type="target" position={Position.Left} className="node-handle" />

      <div className="node-header">
        <VideoCameraOutlined className="node-icon" />
        <span className="node-title">{data.label}</span>
        {isDisabled && <span className="node-disabled-badge">已禁用</span>}
      </div>

      <div className="node-body nodrag nopan nowheel">
        {data.videos.length > 0 ? (
          <div className="video-display-grid">
            {data.videos.map((url, index) => {
              const assetType = getPreviewAssetType(url)

              return (
                <button
                  key={`${url}-${index}`}
                  type="button"
                  className="video-display-card"
                  onClick={() => handleOpenPreview(url, index)}
                >
                  {assetType === 'video' ? (
                    <video
                      className="video-display-media"
                      src={url}
                      muted
                      loop
                      autoPlay
                      playsInline
                    />
                  ) : (
                    <img className="video-display-media" src={url} alt={`${data.label}-${index + 1}`} />
                  )}
                  <span className="video-display-tag">
                    {assetType === 'video' ? '视频片段' : '动图'}
                  </span>
                  <span className="video-display-hint">
                    <PlayCircleOutlined /> 点击预览
                  </span>
                </button>
              )
            })}

            <button type="button" className="video-upload-tile" onClick={handleOpenUpload}>
              <UploadOutlined />
              <span>添加媒体</span>
            </button>
          </div>
        ) : (
          <div className="video-empty-state" onClick={handleOpenUpload}>
            <VideoCameraOutlined className="empty-icon" />
            <span>等待视频结果</span>
            <span className="empty-hint">或点击添加本地视频、GIF、WebP</span>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/gif,image/webp"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  )
})

VideoDisplayNode.displayName = 'VideoDisplayNode'

export default VideoDisplayNode
