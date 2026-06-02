import { memo, useCallback, useEffect, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { MergeCellsOutlined, PlaySquareOutlined } from '@ant-design/icons'
import { Button, Progress, message } from 'antd'

import { concatVideos } from '../../../services/api'
import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { VideoConcatNode as VideoConcatNodeType, VideoConcatNodeData, NodeStatus } from '../../../types'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTitleEditor from '../shared/NodeTitleEditor'
import './style.css'

const VideoConcatNode = memo(({ id, data, selected = false }: NodeProps<VideoConcatNodeType>) => {
  const nodeRef = useRef<HTMLDivElement>(null)
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const getUpstreamVideos = useFlowStore((state) => state.getUpstreamVideos)
  const edges = useFlowStore((state) => state.edges)
  const isWorkflowExecuting = useFlowStore((state) => state.isWorkflowExecuting)
  const activeExecutionNodeId = useFlowStore((state) => state.activeExecutionNodeId)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.videoConcat.width)

  useEffect(() => {
    const upstreamVideos = getUpstreamVideos(id)
    updateNodeData(id, { sourceVideos: upstreamVideos })
  }, [edges, id, getUpstreamVideos, updateNodeData])

  const handleConcat = useCallback(async () => {
    const sourceVideos = data.sourceVideos ?? []
    if (sourceVideos.length === 0) {
      message.warning('请先连接上游视频输入')
      return
    }

    updateNodeData(id, {
      status: 'processing' as NodeStatus,
      progress: 0,
      errorMessage: undefined,
    })

    try {
      updateNodeData(id, { progress: 50 })
      const response = await concatVideos({ video_urls: sourceVideos })
      updateNodeData(id, {
        status: 'success' as NodeStatus,
        progress: 100,
        outputVideo: response.output_video,
      })
      setTimeout(() => {
        useFlowStore.getState().syncDownstream(id)
      }, 100)
      message.success(`已拼接 ${sourceVideos.length} 段视频`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '视频拼接失败'
      updateNodeData(id, {
        status: 'error' as NodeStatus,
        errorMessage,
      })
      message.error(errorMessage)
    }
  }, [id, data.sourceVideos, updateNodeData])

  const handlePreviewOutput = useCallback(() => {
    if (data.outputVideo) {
      openPreview({ type: 'video', src: data.outputVideo, title: `${data.label} - 拼接结果` })
    }
  }, [data.outputVideo, data.label, openPreview])

  const isProcessing = data.status === 'processing'
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const isBlockedByWorkflowExecution = isWorkflowExecuting && activeExecutionNodeId !== id
  const sourceVideos = data.sourceVideos ?? []

  return (
    <>
      <NodeWidthResizer
        nodeId={id}
        selected={selected}
        currentWidth={nodeWidth}
        minWidth={DEFAULT_NODE_SIZES.videoConcat.width}
      />
      <div
        ref={nodeRef}
        className={`video-concat-node status-${data.status}${selected ? ' selected' : ''}${isDisabled ? ' node-disabled' : ''}`}
        style={{ width: nodeWidth }}
      >
        <Handle type="target" position={Position.Left} className="node-handle handle-kind-video" />

        <div className="node-header">
          <MergeCellsOutlined className="node-icon" />
          <NodeTitleEditor
            value={data.label}
            onChange={(value) => updateNodeData(id, { label: value })}
            className="node-title"
            placeholder="输入节点名称"
          />
          {isDisabled && <span className="node-disabled-badge">已禁用</span>}
        </div>

        <div className="node-body nodrag nopan nowheel">
          {sourceVideos.length > 0 ? (
            <div className="source-video-list">
              {sourceVideos.map((videoUrl, index) => (
                <div key={`${videoUrl}-${index}`} className="source-video-item">
                  <span className="video-index">#{index + 1}</span>
                  <span className="video-url">{videoUrl.split('/').pop()}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="source-placeholder">
              连接上游视频节点以添加片段
            </div>
          )}

          {sourceVideos.length > 1 && (
            <div className="concat-info">
              将从 #{1} 到 #{sourceVideos.length} 按连接顺序拼接
            </div>
          )}

          {isProcessing && (
            <div className="progress-bar">
              <Progress
                percent={data.progress}
                size="small"
                status="active"
                strokeColor="#1677ff"
              />
            </div>
          )}

          {data.status === 'error' && data.errorMessage && (
            <div className="error-message">{data.errorMessage}</div>
          )}

          {data.status === 'success' && data.outputVideo && (
            <video
              className="output-video-preview"
              src={data.outputVideo}
              controls
              onClick={handlePreviewOutput}
            />
          )}

          <Button
            type="primary"
            block
            onClick={handleConcat}
            loading={isProcessing}
            disabled={isDisabled || isBlockedByWorkflowExecution || sourceVideos.length < 2}
            className="generate-btn nodrag"
          >
            {isProcessing
              ? '拼接中...'
              : isBlockedByWorkflowExecution
                ? '工作流执行中，请稍候'
                : sourceVideos.length < 2
                  ? '需至少连接 2 段视频'
                  : `拼接 ${sourceVideos.length} 段视频`}
          </Button>
        </div>

        <Handle type="source" position={Position.Right} className="node-handle handle-kind-video" />
      </div>
    </>
  )
})

VideoConcatNode.displayName = 'VideoConcatNode'

export default VideoConcatNode
