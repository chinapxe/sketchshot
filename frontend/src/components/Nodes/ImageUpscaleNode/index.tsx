import { memo, useCallback, useEffect, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ExpandOutlined, SyncOutlined } from '@ant-design/icons'
import { Button, Progress, Select, message } from 'antd'

import { executeImageUpscaleNode } from '../../../services/nodeGeneration'
import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { ImageUpscaleNode as ImageUpscaleNodeType, ImageUpscaleNodeData } from '../../../types'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTitleEditor from '../shared/NodeTitleEditor'
import NodeTextareaEditor from '../shared/NodeTextareaEditor'
import './style.css'

const resolutionOptions = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
]

const ImageUpscaleNode = memo(({ id, data, selected = false }: NodeProps<ImageUpscaleNodeType>) => {
  const nodeRef = useRef<HTMLDivElement>(null)
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const getUpstreamImages = useFlowStore((state) => state.getUpstreamImages)
  const edges = useFlowStore((state) => state.edges)
  const isWorkflowExecuting = useFlowStore((state) => state.isWorkflowExecuting)
  const activeExecutionNodeId = useFlowStore((state) => state.activeExecutionNodeId)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.imageGen.width)

  useEffect(() => {
    const upstreamImages = getUpstreamImages(id)
    updateNodeData(id, { sourceImage: upstreamImages[0] ?? undefined })
  }, [edges, id, getUpstreamImages, updateNodeData])

  const handleGenerate = useCallback(async () => {
    if (!data.sourceImage) {
      message.warning('请先连接上游图片输入')
      return
    }

    try {
      await executeImageUpscaleNode(id)
    } catch (error) {
      console.error(`[image-upscale:${id}] execute failed:`, error)
    }
  }, [id, data.sourceImage])

  const handlePreviewSource = useCallback(() => {
    if (data.sourceImage) {
      openPreview({ type: 'image', src: data.sourceImage, title: `${data.label} - 源图` })
    }
  }, [data.sourceImage, data.label, openPreview])

  const handlePreviewOutput = useCallback(() => {
    if (data.outputImage) {
      openPreview({ type: 'image', src: data.outputImage, title: `${data.label} - 放大结果` })
    }
  }, [data.outputImage, data.label, openPreview])

  const isProcessing = data.status === 'processing' || data.status === 'queued'
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const needsRefresh = data.needsRefresh === true
  const isBlockedByWorkflowExecution = isWorkflowExecuting && activeExecutionNodeId !== id

  const is4KUnavailable = data.targetResolution !== '1080p' // no restriction for upscale

  return (
    <>
      <NodeWidthResizer
        nodeId={id}
        selected={selected}
        currentWidth={nodeWidth}
        minWidth={DEFAULT_NODE_SIZES.imageGen.width}
      />
      <div
        ref={nodeRef}
        className={`image-upscale-node status-${data.status}${needsRefresh ? ' needs-refresh' : ''}${isDisabled ? ' node-disabled' : ''}`}
        style={{ width: nodeWidth }}
      >
        <Handle type="target" position={Position.Left} className="node-handle handle-kind-image" />

        <div className="node-header">
          <ExpandOutlined className="node-icon" />
          <NodeTitleEditor
            value={data.label}
            onChange={(value) => updateNodeData(id, { label: value })}
            className="node-title"
            placeholder="输入节点名称"
          />
          {needsRefresh && !isProcessing && (
            <span className="node-refresh-badge">
              <SyncOutlined /> 需更新
            </span>
          )}
          {isDisabled && <span className="node-disabled-badge">已禁用</span>}
        </div>

        <div className="node-body nodrag nopan nowheel">
          {data.sourceImage ? (
            <img
              className="source-image-preview"
              src={data.sourceImage}
              alt="源图"
              onClick={handlePreviewSource}
            />
          ) : (
            <div className="source-placeholder">连接上游图片节点以获取输入</div>
          )}

          <div className="form-field">
            <label className="field-label">放大描述</label>
            <NodeTextareaEditor
              variant="native"
              className="prompt-textarea nodrag"
              value={data.prompt}
              onCommit={(value) => updateNodeData(id, { prompt: value })}
              placeholder="高清放大，超分辨率，增强细节和清晰度..."
              rows={3}
            />
          </div>

          <div className="upscale-params-row">
            <div className="form-field">
              <label className="field-label">目标分辨率</label>
              <Select
                size="small"
                value={data.targetResolution}
                onChange={(value) => updateNodeData(id, { targetResolution: value })}
                options={resolutionOptions}
                className="field-select nodrag nopan"
              />
            </div>
          </div>

          {needsRefresh && !isProcessing && (
            <div className="refresh-tip">
              上游图片或参数已变化，建议重新放大以同步最新结果。
            </div>
          )}

          {(data.status === 'processing' || data.status === 'queued') && (
            <div className="progress-bar">
              <Progress
                percent={data.progress}
                size="small"
                status={data.status === 'queued' ? 'normal' : 'active'}
                strokeColor="#1677ff"
              />
            </div>
          )}

          {data.status === 'error' && data.errorMessage && (
            <div className="error-message">{data.errorMessage}</div>
          )}

          {data.status === 'success' && data.outputImage && (
            <img
              className="output-image-preview"
              src={data.outputImage}
              alt="放大结果"
              onClick={handlePreviewOutput}
            />
          )}

          <Button
            type="primary"
            block
            onClick={handleGenerate}
            loading={isProcessing || (isWorkflowExecuting && activeExecutionNodeId === id)}
            disabled={isDisabled || isBlockedByWorkflowExecution || !data.sourceImage}
            className="generate-btn nodrag"
          >
            {data.status === 'queued'
              ? '排队中...'
              : isProcessing || (isWorkflowExecuting && activeExecutionNodeId === id)
                ? '放大中...'
                : isBlockedByWorkflowExecution
                  ? '工作流执行中，请稍候'
                  : needsRefresh
                    ? '重新放大'
                    : '开始放大'}
          </Button>
        </div>

        <Handle type="source" position={Position.Right} className="node-handle handle-kind-image" />
      </div>
    </>
  )
})

ImageUpscaleNode.displayName = 'ImageUpscaleNode'

export default ImageUpscaleNode
