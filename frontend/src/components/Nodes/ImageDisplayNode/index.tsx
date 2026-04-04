/**
 * 图片展示节点。
 * 展示 AI 生成的结果图片。
 */
import { memo, useCallback, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { PictureOutlined, UploadOutlined } from '@ant-design/icons'

import { useFlowStore } from '../../../stores/useFlowStore'
import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import type { ImageDisplayNode as ImageDisplayNodeType } from '../../../types'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import './style.css'

const ImageDisplayNode = memo(({ id, data, selected = false }: NodeProps<ImageDisplayNodeType>) => {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const openPreview = useAssetPreviewStore((s) => s.openPreview)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.imageDisplay.width)

  const handleReUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleOpenPreview = useCallback((imageUrl: string, index: number) => {
    openPreview({
      type: 'image',
      src: imageUrl,
      title: `${data.label} - 图片结果 ${index + 1}`,
    })
  }, [data.label, openPreview])

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (!files || files.length === 0) return

      const urls = Array.from(files).map((file) => URL.createObjectURL(file))
      updateNodeData(id, { images: [...data.images, ...urls] })
      event.target.value = ''
    },
    [data.images, id, updateNodeData]
  )

  const isDisabled = (data as Record<string, unknown>).disabled === true

  return (
    <>
      <NodeWidthResizer
        nodeId={id}
        selected={selected}
        currentWidth={nodeWidth}
        minWidth={DEFAULT_NODE_SIZES.imageDisplay.width}
      />
      <div className={`image-display-node${isDisabled ? ' node-disabled' : ''}`} style={{ width: nodeWidth }}>
        <Handle type="target" position={Position.Left} className="node-handle" />

        <div className="node-header">
          <PictureOutlined className="node-icon" />
          <span className="node-title">{data.label}</span>
          {isDisabled && <span className="node-disabled-badge">已禁用</span>}
        </div>

        <div className="node-body nodrag nopan nowheel">
          {data.images.length > 0 ? (
            <div className="display-grid">
              {data.images.map((imageUrl, index) => (
                <button
                  key={index}
                  type="button"
                  className="display-image-button"
                  onClick={() => handleOpenPreview(imageUrl, index)}
                >
                  <img src={imageUrl} alt={`图片结果 ${index + 1}`} className="display-image" />
                  <span className="display-image-hint">点击查看预览</span>
                </button>
              ))}
              <div
                className="re-upload-btn"
                onClick={handleReUpload}
                role="button"
                tabIndex={0}
              >
                <UploadOutlined /> 补充图片
              </div>
            </div>
          ) : (
            <div className="empty-display" onClick={handleReUpload}>
              <PictureOutlined className="empty-icon" />
              <span>等待图片结果汇入</span>
              <span className="empty-hint">连接上游出图节点后会自动显示，也可点击补充本地图片</span>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        <Handle type="source" position={Position.Right} className="node-handle" />
      </div>
    </>
  )
})

ImageDisplayNode.displayName = 'ImageDisplayNode'

export default ImageDisplayNode
