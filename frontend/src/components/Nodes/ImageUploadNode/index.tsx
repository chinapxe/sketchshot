/**
 * Image upload node.
 */
import { memo, useCallback, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { PictureOutlined, UploadOutlined } from '@ant-design/icons'
import { message } from 'antd'

import { uploadImageAsset } from '../../../services/api'
import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { ImageUploadNode as ImageUploadNodeType } from '../../../types'
import './style.css'

const ImageUploadNode = memo(({ id, data }: NodeProps<ImageUploadNodeType>) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      updateNodeData(id, {
        isUploading: true,
        uploadError: undefined,
      })

      try {
        const uploadedAsset = await uploadImageAsset(file)
        updateNodeData(id, {
          imageUrl: uploadedAsset.url,
          fileName: uploadedAsset.file_name,
          isUploading: false,
          uploadError: undefined,
        })
        message.success('Reference image uploaded')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Upload failed'
        updateNodeData(id, {
          isUploading: false,
          uploadError: errorMessage,
        })
        message.error(errorMessage)
      } finally {
        event.target.value = ''
      }
    },
    [id, updateNodeData]
  )

  const handlePreview = useCallback(() => {
    if (!data.imageUrl) {
      handleUpload()
      return
    }

    openPreview({
      type: 'image',
      src: data.imageUrl,
      title: data.fileName || 'Reference Image',
    })
  }, [data.fileName, data.imageUrl, handleUpload, openPreview])

  const handleReUpload = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation()
      handleUpload()
    },
    [handleUpload]
  )

  const isDisabled = (data as Record<string, unknown>).disabled === true
  const isUploading = data.isUploading === true
  const uploadError = typeof data.uploadError === 'string' ? data.uploadError : ''

  return (
    <div className={`image-upload-node${isDisabled ? ' node-disabled' : ''}`}>
      <div className="node-header">
        <PictureOutlined className="node-icon" />
        <span className="node-title">{data.label}</span>
        {isDisabled && <span className="node-disabled-badge">Disabled</span>}
      </div>

      <div className="node-body" onClick={handlePreview}>
        {data.imageUrl ? (
          <div className="image-preview-wrapper">
            <img src={data.imageUrl} alt={data.fileName || 'Reference'} className="image-preview" />
            <div className="preview-hint">{isUploading ? 'Uploading...' : 'Click to preview'}</div>
            <div
              className="re-upload-overlay"
              onClick={handleReUpload}
              role="button"
              tabIndex={0}
            >
              <UploadOutlined /> {isUploading ? 'Uploading...' : 'Re-upload'}
            </div>
          </div>
        ) : (
          <div className="upload-placeholder">
            <UploadOutlined className="upload-icon" />
            <span>{isUploading ? 'Uploading...' : 'Click to upload image'}</span>
          </div>
        )}

        {uploadError && (
          <div className="error-message">{uploadError}</div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <Handle type="source" position={Position.Right} className="node-handle" />
      <Handle type="target" position={Position.Left} className="node-handle" />
    </div>
  )
})

ImageUploadNode.displayName = 'ImageUploadNode'

export default ImageUploadNode
