import { memo, useCallback, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { PlayCircleOutlined, UploadOutlined, VideoCameraOutlined } from '@ant-design/icons'

import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { VideoDisplayNode as VideoDisplayNodeType } from '../../../types'
import { getPreviewAssetType } from '../../../utils/media'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTitleEditor from '../shared/NodeTitleEditor'
import './style.css'

const VideoDisplayNode = memo(({ id, data, selected = false }: NodeProps<VideoDisplayNodeType>) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.videoDisplay.width)

  const handleOpenUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleOpenPreview = useCallback(
    (url: string, index: number) => {
      openPreview({
        type: getPreviewAssetType(url),
        src: url,
        title: `${data.label} - 视频结果 ${index + 1}`,
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
    <>
      <NodeWidthResizer
        nodeId={id}
        selected={selected}
        currentWidth={nodeWidth}
        minWidth={DEFAULT_NODE_SIZES.videoDisplay.width}
      />
      <div className={`video-display-node${isDisabled ? ' node-disabled' : ''}`} style={{ width: nodeWidth }}>
        <Handle type="target" position={Position.Left} className="node-handle handle-kind-video" />

      <div className="node-header">
        <VideoCameraOutlined className="node-icon" />
        <NodeTitleEditor
          value={data.label}
          onChange={(value) => updateNodeData(id, { label: value })}
          className="node-title"
          placeholder="输入节点名称"
        />
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
                    {assetType === 'video' ? '视频结果' : '动图结果'}
                  </span>
                  <span className="video-display-hint">
                    <PlayCircleOutlined /> 查看预览
                  </span>
                </button>
              )
            })}

            <button type="button" className="video-upload-tile" onClick={handleOpenUpload}>
              <UploadOutlined />
              <span>补充媒体</span>
            </button>
          </div>
        ) : (
          <div className="video-empty-state" onClick={handleOpenUpload}>
            <VideoCameraOutlined className="empty-icon" />
            <span>等待视频结果汇入</span>
            <span className="empty-hint">连接视频生成或镜头视频结果后会自动显示，也可点击导入本地媒体</span>
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
    </>
  )
})

VideoDisplayNode.displayName = 'VideoDisplayNode'

export default VideoDisplayNode
