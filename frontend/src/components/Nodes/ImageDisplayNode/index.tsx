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
import './style.css'

const ImageDisplayNode = memo(({ id, data }: NodeProps<ImageDisplayNodeType>) => {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const openPreview = useAssetPreviewStore((s) => s.openPreview)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleReUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleOpenPreview = useCallback((imageUrl: string, index: number) => {
    openPreview({
      type: 'image',
      src: imageUrl,
      title: `${data.label} - 结果 ${index + 1}`,
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
    <div className={`image-display-node${isDisabled ? ' node-disabled' : ''}`}>
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
                <img src={imageUrl} alt={`结果 ${index + 1}`} className="display-image" />
                <span className="display-image-hint">点击查看大图</span>
              </button>
            ))}
            <div
              className="re-upload-btn"
              onClick={handleReUpload}
              role="button"
              tabIndex={0}
            >
              <UploadOutlined /> 重新上传
            </div>
          </div>
        ) : (
          <div className="empty-display" onClick={handleReUpload}>
            <PictureOutlined className="empty-icon" />
            <span>等待生成结果</span>
            <span className="empty-hint">或点击手动上传</span>
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
  )
})

ImageDisplayNode.displayName = 'ImageDisplayNode'

export default ImageDisplayNode
