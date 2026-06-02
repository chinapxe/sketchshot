/**
 * 视频上传节点 — 上传视频文件供下游节点使用。
 */
import { memo, useCallback, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { UploadOutlined, VideoCameraOutlined } from '@ant-design/icons'
import { message } from 'antd'

import { uploadImageAsset } from '../../../services/api'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { VideoUploadNode as VideoUploadNodeType } from '../../../types'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTitleEditor from '../shared/NodeTitleEditor'
import './style.css'

const VideoUploadNode = memo(({ id, data, selected = false }: NodeProps<VideoUploadNodeType>) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.videoUpload.width)

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
          videoUrl: uploadedAsset.url,
          fileName: uploadedAsset.file_name,
          isUploading: false,
          uploadError: undefined,
        })
        message.success('视频上传成功')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '上传失败'
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

  const isDisabled = (data as Record<string, unknown>).disabled === true
  const isUploading = data.isUploading === true
  const uploadError = typeof data.uploadError === 'string' ? data.uploadError : ''
  const hasVideo = Boolean(data.videoUrl)

  return (
    <>
      <NodeWidthResizer
        nodeId={id}
        selected={selected}
        currentWidth={nodeWidth}
        minWidth={DEFAULT_NODE_SIZES.videoUpload.width}
      />
      <div className={`video-upload-node${selected ? ' selected' : ''}${isDisabled ? ' node-disabled' : ''}`} style={{ width: nodeWidth }}>
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

        <div className="node-body nodrag nopan nowheel" onClick={handleUpload}>
          {hasVideo ? (
            <div className="video-upload-preview-wrapper">
              <video
                src={data.videoUrl}
                className="video-upload-preview"
                muted
                loop
                autoPlay
                playsInline
              />
              <div className="video-upload-hint">
                {isUploading ? '上传中...' : '点击重新上传'}
              </div>
            </div>
          ) : (
            <div className="video-upload-placeholder">
              <UploadOutlined className="upload-icon" />
              <span>{isUploading ? '上传中...' : '点击上传视频'}</span>
            </div>
          )}

          {uploadError && (
            <div className="error-message">{uploadError}</div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        <Handle type="source" position={Position.Right} className="node-handle handle-kind-video" />
      </div>
    </>
  )
})

VideoUploadNode.displayName = 'VideoUploadNode'

export default VideoUploadNode
