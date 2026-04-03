import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  HighlightOutlined,
  PlayCircleOutlined,
  SyncOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { Button, Progress, Select, Slider, message } from 'antd'

import { generateVideoPrompt } from '../../../services/promptGeneration'
import { disconnectVideoGeneration, executeVideoGenNode } from '../../../services/videoGeneration'
import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { VideoGenNode as VideoGenNodeType } from '../../../types'
import { getPreviewAssetType } from '../../../utils/media'
import './style.css'

const aspectRatioOptions = [
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
]

const durationOptions = [
  { value: 2, label: '2 秒' },
  { value: 4, label: '4 秒' },
  { value: 6, label: '6 秒' },
  { value: 8, label: '8 秒' },
]

const adapterOptions = [
  { value: 'volcengine', label: '火山引擎' },
  { value: 'mock', label: '模拟模式' },
]

const VideoGenNode = memo(({ id, data }: NodeProps<VideoGenNodeType>) => {
  const nodeRef = useRef<HTMLDivElement>(null)
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const getUpstreamImages = useFlowStore((state) => state.getUpstreamImages)
  const edges = useFlowStore((state) => state.edges)
  const isWorkflowExecuting = useFlowStore((state) => state.isWorkflowExecuting)
  const activeExecutionNodeId = useFlowStore((state) => state.activeExecutionNodeId)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const [isPromptGenerating, setIsPromptGenerating] = useState(false)

  useEffect(() => {
    updateNodeData(id, { sourceImages: getUpstreamImages(id) })
  }, [edges, getUpstreamImages, id, updateNodeData])

  useEffect(() => () => disconnectVideoGeneration(id), [id])

  const blurButtonIfFocused = useCallback((selector: string) => {
    const root = nodeRef.current
    const activeElement = document.activeElement

    if (!root || !(activeElement instanceof HTMLElement)) return

    const button = root.querySelector<HTMLElement>(selector)
    if (button && activeElement === button) {
      button.blur()
    }
  }, [])

  useEffect(() => {
    if (!isPromptGenerating) {
      blurButtonIfFocused('.prompt-helper-btn')
    }
  }, [blurButtonIfFocused, isPromptGenerating])

  const handleGenerate = useCallback(async () => {
    try {
      await executeVideoGenNode(id)
    } catch (error) {
      console.error(`[video-gen:${id}] execute failed:`, error)
    }
  }, [id])

  const handleGeneratePrompt = useCallback(async () => {
    setIsPromptGenerating(true)

    try {
      const latestStore = useFlowStore.getState()
      const sourceImages = latestStore.getUpstreamImages(id)
      latestStore.updateNodeData(id, { sourceImages })

      const latestNode = useFlowStore.getState().nodes.find((node) => node.id === id)
      if (!latestNode || latestNode.type !== 'videoGen') {
        throw new Error('视频生成节点不存在')
      }

      const generatedPrompt = await generateVideoPrompt(latestNode.data)
      updateNodeData(id, { prompt: generatedPrompt })
      message.success('视频提示词已优化')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '提示词优化失败'
      message.error(errorMessage)
    } finally {
      setIsPromptGenerating(false)
    }
  }, [id, updateNodeData])

  const handlePromptChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { prompt: event.target.value })
    },
    [id, updateNodeData]
  )

  const handlePreviewSource = useCallback(
    (imageUrl: string, index: number) => {
      openPreview({
        type: 'image',
        src: imageUrl,
        title: `${data.label} - 源图 ${index + 1}`,
      })
    },
    [data.label, openPreview]
  )

  const handlePreviewOutput = useCallback(() => {
    if (!data.outputVideo) return

    openPreview({
      type: getPreviewAssetType(data.outputVideo),
      src: data.outputVideo,
      title: `${data.label} - 输出结果`,
    })
  }, [data.label, data.outputVideo, openPreview])

  const isProcessing = data.status === 'processing' || data.status === 'queued'
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const needsRefresh = data.needsRefresh === true
  const hasSourceImages = (data.sourceImages ?? []).length > 0
  const isBlockedByWorkflowExecution = isWorkflowExecuting && activeExecutionNodeId !== id
  const outputAssetType = data.outputVideo ? getPreviewAssetType(data.outputVideo) : 'video'

  useEffect(() => {
    if (!isProcessing && (!isWorkflowExecuting || activeExecutionNodeId !== id)) {
      blurButtonIfFocused('.generate-btn')
    }
  }, [activeExecutionNodeId, blurButtonIfFocused, id, isProcessing, isWorkflowExecuting])

  return (
    <div
      ref={nodeRef}
      className={`video-gen-node status-${data.status}${needsRefresh ? ' needs-refresh' : ''}${isDisabled ? ' node-disabled' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="node-handle" />

      <div className="node-header">
        <VideoCameraOutlined className="node-icon" />
        <span className="node-title">{data.label}</span>
        {needsRefresh && !isProcessing && (
          <span className="node-refresh-badge">
            <SyncOutlined /> 待刷新
          </span>
        )}
        {isDisabled && <span className="node-disabled-badge">已禁用</span>}
      </div>

      <div className="node-body nodrag nopan nowheel">
        <div className="form-field">
          <label className="field-label">源图帧</label>
          {hasSourceImages ? (
            <div className="video-source-grid">
              {(data.sourceImages ?? []).map((imageUrl, index) => (
                <button
                  key={`${imageUrl}-${index}`}
                  type="button"
                  className="video-source-button"
                  onClick={() => handlePreviewSource(imageUrl, index)}
                >
                  <img src={imageUrl} alt={`源图 ${index + 1}`} className="video-source-thumb" />
                </button>
              ))}
            </div>
          ) : (
            <div className="video-empty-panel">
              请先连接图片上传、图片生成或镜头节点的图像结果。
            </div>
          )}
        </div>

        <div className="form-field">
          <div className="field-label-row">
            <label className="field-label">运动提示词</label>
            <Button
              type="text"
              size="small"
              icon={<HighlightOutlined />}
              onClick={handleGeneratePrompt}
              loading={isPromptGenerating}
              disabled={isPromptGenerating || isProcessing || isDisabled || isBlockedByWorkflowExecution}
              className="prompt-helper-btn nodrag"
            >
              AI 优化
            </Button>
          </div>
          <textarea
            className="prompt-textarea nodrag"
            value={data.prompt}
            onChange={handlePromptChange}
            placeholder="描述镜头运动、主体动作、速度节奏等内容..."
            rows={3}
          />
        </div>

        <div className="form-row">
          <div className="form-field flex-1">
            <label className="field-label">画面比例</label>
            <Select
              size="small"
              value={data.aspectRatio}
              onChange={(value) => updateNodeData(id, { aspectRatio: value })}
              options={aspectRatioOptions}
              className="field-select nodrag nopan"
            />
          </div>

          <div className="form-field flex-1">
            <label className="field-label">时长</label>
            <Select
              size="small"
              value={data.durationSeconds}
              onChange={(value) => updateNodeData(id, { durationSeconds: value })}
              options={durationOptions}
              className="field-select nodrag nopan"
            />
          </div>
        </div>

        <div className="form-field">
          <label className="field-label">运动强度</label>
          <Slider
            min={0.1}
            max={1}
            step={0.05}
            value={data.motionStrength}
            onChange={(value) => updateNodeData(id, { motionStrength: Number(value) })}
            tooltip={{ formatter: (value) => `${Math.round((value ?? 0) * 100)}%` }}
            className="nodrag"
          />
        </div>

        <div className="form-field">
          <label className="field-label">适配器</label>
          <Select
            size="small"
            value={data.adapter}
            onChange={(value) => updateNodeData(id, { adapter: value })}
            options={adapterOptions}
            className="field-select nodrag nopan"
          />
        </div>

        {needsRefresh && !isProcessing && (
          <div className="refresh-tip">
            上游图片或当前运动参数已变化，建议重新执行以同步最新结果。
          </div>
        )}

        {data.outputVideo && (
          <div className="form-field">
            <label className="field-label">最新输出</label>
            <button type="button" className="video-output-card" onClick={handlePreviewOutput}>
              {outputAssetType === 'video' ? (
                <video
                  className="video-output-media"
                  src={data.outputVideo}
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              ) : (
                <img className="video-output-media" src={data.outputVideo} alt={`${data.label} 输出`} />
              )}
              <span className="video-output-hint">点击查看完整结果</span>
            </button>
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

        <Button
          type="primary"
          block
          onClick={handleGenerate}
          loading={isProcessing || (isWorkflowExecuting && activeExecutionNodeId === id)}
          disabled={isDisabled || isBlockedByWorkflowExecution || !hasSourceImages}
          className="generate-btn nodrag"
          icon={<PlayCircleOutlined />}
        >
          {data.status === 'queued'
            ? '排队中...'
            : isProcessing || (isWorkflowExecuting && activeExecutionNodeId === id)
              ? '生成中...'
              : isBlockedByWorkflowExecution
                ? '工作流执行中...'
                : !hasSourceImages
                  ? '请先连接图像输入'
                  : `${needsRefresh ? '重新生成视频' : '生成视频'} - ${data.creditCost}`}
        </Button>
      </div>

      <Handle type="source" position={Position.Right} className="node-handle" />
    </div>
  )
})

VideoGenNode.displayName = 'VideoGenNode'

export default VideoGenNode
