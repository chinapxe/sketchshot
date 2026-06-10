import { memo, useCallback, useEffect, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { SwapOutlined } from '@ant-design/icons'
import { Button, Progress, Select, message } from 'antd'

import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import { createAnimateMixTask } from '../../../services/api'
import type { AnimateMixNode as AnimateMixNodeType } from '../../../types'
import type { NodeStatus } from '../../../types'
import { getPreviewAssetType } from '../../../utils/media'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTitleEditor from '../shared/NodeTitleEditor'
import './style.css'

const modeOptions = [
  { value: 'wan-std', label: '标准模式' },
  { value: 'wan-pro', label: '专业模式' },
]

const AnimateMixNode = memo(({ id, data, selected = false }: NodeProps<AnimateMixNodeType>) => {
  const nodeRef = useRef<HTMLDivElement>(null)
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const getUpstreamVideos = useFlowStore((state) => state.getUpstreamVideos)
  const getUpstreamImages = useFlowStore((state) => state.getUpstreamImages)
  const edges = useFlowStore((state) => state.edges)
  const isWorkflowExecuting = useFlowStore((state) => state.isWorkflowExecuting)
  const activeExecutionNodeId = useFlowStore((state) => state.activeExecutionNodeId)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.animateMix.width)

  useEffect(() => {
    const upstreamVideos = getUpstreamVideos(id)
    const upstreamImages = getUpstreamImages(id)
    if (upstreamVideos.length > 0) {
      updateNodeData(id, { sourceVideo: upstreamVideos[0] })
    }
    if (upstreamImages.length > 0) {
      updateNodeData(id, { sourceImage: upstreamImages[0] })
    }
  }, [edges, getUpstreamVideos, getUpstreamImages, id, updateNodeData])

  const isProcessing = data.status === 'processing' || data.status === 'queued'
  const isBlockedByWorkflowExecution = isWorkflowExecuting && activeExecutionNodeId !== id
  const canGenerate = !isProcessing && !isBlockedByWorkflowExecution
  const needsRefresh = data.status === 'success' && (data.sourceVideo || data.sourceImage)

  const handleGenerate = useCallback(async () => {
    if (!data.sourceVideo) {
      updateNodeData(id, {
        status: 'error' as NodeStatus,
        errorMessage: '请先连接上游视频输入',
      })
      message.warning('请先连接上游视频输入')
      return
    }

    if (!data.sourceImage) {
      updateNodeData(id, {
        status: 'error' as NodeStatus,
        errorMessage: '请先连接人物图片输入',
      })
      message.warning('请先连接人物图片输入')
      return
    }

    updateNodeData(id, {
      status: 'queued' as NodeStatus,
      progress: 0,
      errorMessage: undefined,
    })

    try {
      const result = await createAnimateMixTask({
        node_id: id,
        source_video: data.sourceVideo,
        source_image: data.sourceImage,
        mode: data.mode,
        adapter: 'happyhorse',
      })

      updateNodeData(id, {
        status: 'processing' as NodeStatus,
        progress: 10,
      })

      const poll = async () => {
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/generate/${result.task_id}/status`
        )
        const status = await response.json()

        if (status.status === 'processing' || status.status === 'pending') {
          updateNodeData(id, { progress: status.progress ?? 50 })
          setTimeout(poll, 2000)
          return
        }

        if (status.status === 'success' && status.output_video) {
          updateNodeData(id, {
            status: 'success' as NodeStatus,
            progress: 100,
            outputVideo: status.output_video,
            errorMessage: undefined,
          })
          message.success('视频换人完成')
          return
        }

        updateNodeData(id, {
          status: 'error' as NodeStatus,
          errorMessage: status.message || '换人失败',
        })
        message.error(status.message || '换人失败')
      }

      setTimeout(poll, 2000)
    } catch (error) {
      updateNodeData(id, {
        status: 'error' as NodeStatus,
        errorMessage: error instanceof Error ? error.message : '请求失败',
      })
      message.error(error instanceof Error ? error.message : '请求失败')
    }
  }, [id, data.sourceVideo, data.sourceImage, data.mode, updateNodeData])

  const getStatusBadge = () => {
    if (isProcessing) return <span className="node-status-badge status-processing">处理中...</span>
    if (data.status === 'error') return <span className="node-status-badge status-error">失败</span>
    if (data.status === 'success') return <span className="node-status-badge status-success">完成</span>
    return null
  }

  const handlePreviewOutput = useCallback(() => {
    if (data.outputVideo) {
      openPreview({
        type: getPreviewAssetType(data.outputVideo),
        src: data.outputVideo,
        title: `${data.label} - 换人结果`,
      })
    }
  }, [data.outputVideo, openPreview])

  return (
    <div
      ref={nodeRef}
      className={`animate-mix-node${selected ? ' selected' : ''}${data.status === 'success' ? ' status-success' : ''}${data.status === 'error' ? ' status-error' : ''}${data.status === 'processing' || data.status === 'queued' ? ' status-processing' : ''}`}
      style={{ width: nodeWidth }}
    >
      <Handle type="target" position={Position.Left} className="node-handle handle-kind-video" />
      <Handle type="target" position={Position.Left} id="person-image" className="node-handle handle-kind-image" />
      <Handle type="source" position={Position.Right} className="node-handle handle-kind-video" />

      <div className="node-header">
        <SwapOutlined className="node-header-icon" />
        <NodeTitleEditor
          value={data.label}
          onChange={(value) => updateNodeData(id, { label: value })}
        />
        {getStatusBadge()}
      </div>

      <div className="node-body">
        <div className="form-field">
          <label className="field-label">源视频</label>
          {data.sourceVideo ? (
            <div className="amix-source-video">
              {getPreviewAssetType(data.sourceVideo) === 'video' ? (
                <video
                  className="amix-source-video-player"
                  src={data.sourceVideo}
                  controls
                  loop
                  autoPlay
                  playsInline
                />
              ) : (
                <div className="amix-source-video-placeholder">不支持的视频格式</div>
              )}
            </div>
          ) : (
            <div className="amix-empty-placeholder">
              请连接上游视频源
            </div>
          )}
        </div>

        <div className="form-field">
          <label className="field-label">人物图片</label>
          {data.sourceImage ? (
            <div className="amix-person-image">
              {/^(https?:|\/)/.test(data.sourceImage) ? (
                <img src={data.sourceImage} alt="替换人物" className="amix-person-image-preview" />
              ) : (
                <div className="amix-person-image-preview amix-person-placeholder">官方人像 (asset://)</div>
              )}
            </div>
          ) : (
            <div className="amix-empty-placeholder">
              请连接上游人物图片
            </div>
          )}
        </div>

        <div className="form-row">
          <div className="form-field flex-1">
            <label className="field-label">换人模式</label>
            <Select
              size="small"
              value={data.mode}
              onChange={(value) => updateNodeData(id, { mode: value })}
              options={modeOptions}
              className="field-select nodrag nopan"
            />
          </div>
        </div>

        {needsRefresh && !isProcessing && (
          <div className="refresh-tip">
            源视频或图片已变化，建议重新执行。
          </div>
        )}

        {data.outputVideo && (
          <div className="form-field">
            <label className="field-label">换人结果</label>
            <button type="button" className="amix-output-card" onClick={handlePreviewOutput}>
              {getPreviewAssetType(data.outputVideo) === 'video' ? (
                <video
                  className="amix-output-media"
                  src={data.outputVideo}
                  loop
                  muted
                  playsInline
                />
              ) : (
                <div className="amix-output-hint">点击预览</div>
              )}
              <div className="amix-output-hint">点击预览</div>
            </button>
          </div>
        )}

        {isProcessing && (
          <div className="form-field">
            <Progress percent={data.progress} size="small" showInfo={false} strokeColor="#1677ff" />
            <div className="amix-progress-text">
              {data.status === 'queued' ? '排队中...' : `处理中 ${data.progress}%`}
            </div>
          </div>
        )}

        <div className="form-actions">
          <Button
            type="primary"
            block
            size="small"
            onClick={handleGenerate}
            disabled={!canGenerate}
            loading={isProcessing}
          >
            {isProcessing ? '处理中...' : '执行换人'}
          </Button>
        </div>
      </div>

      <NodeWidthResizer nodeId={id} selected={selected} currentWidth={nodeWidth} minWidth={DEFAULT_NODE_SIZES.animateMix.width} />
    </div>
  )
})

AnimateMixNode.displayName = 'AnimateMixNode'

export default AnimateMixNode
