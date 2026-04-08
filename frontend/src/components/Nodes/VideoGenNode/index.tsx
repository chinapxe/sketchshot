import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  HighlightOutlined,
  PlayCircleOutlined,
  SyncOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { Button, Progress, Select, Slider, message } from 'antd'

import {
  VIDEO_MOTION_PROMPT_CHIPS,
  VIDEO_QUICK_TEMPLATES,
  appendPromptFragment,
  appendPromptLine,
} from '../../../config/generationQuickPresets'
import { generateVideoPrompt } from '../../../services/promptGeneration'
import { disconnectVideoGeneration, executeVideoGenNode } from '../../../services/videoGeneration'
import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { VideoGenNode as VideoGenNodeType } from '../../../types'
import { getPreviewAssetType } from '../../../utils/media'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTextareaEditor from '../shared/NodeTextareaEditor'
import NodeTitleEditor from '../shared/NodeTitleEditor'
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

const VideoGenNode = memo(({ id, data, selected = false }: NodeProps<VideoGenNodeType>) => {
  const nodeRef = useRef<HTMLDivElement>(null)
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const getUpstreamImages = useFlowStore((state) => state.getUpstreamImages)
  const edges = useFlowStore((state) => state.edges)
  const isWorkflowExecuting = useFlowStore((state) => state.isWorkflowExecuting)
  const activeExecutionNodeId = useFlowStore((state) => state.activeExecutionNodeId)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const [isPromptGenerating, setIsPromptGenerating] = useState(false)
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.videoGen.width)

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
      message.success('视频描述已润色')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '视频描述润色失败'
      message.error(errorMessage)
    } finally {
      setIsPromptGenerating(false)
    }
  }, [id, updateNodeData])

  const handleApplyQuickTemplate = useCallback(
    (templateId: string) => {
      const template = VIDEO_QUICK_TEMPLATES.find((item) => item.id === templateId)
      if (!template) return

      const latestNode = useFlowStore.getState().nodes.find((node) => node.id === id)
      const latestData = latestNode?.type === 'videoGen' ? latestNode.data : data

      updateNodeData(id, {
        prompt: appendPromptLine(latestData.prompt, template.prompt),
        aspectRatio: template.aspectRatio ?? latestData.aspectRatio,
        durationSeconds: template.durationSeconds ?? latestData.durationSeconds,
        motionStrength: template.motionStrength ?? latestData.motionStrength,
      })
    },
    [data, id, updateNodeData]
  )

  const handleApplyMotionChip = useCallback(
    (fragment: string) => {
      const latestNode = useFlowStore.getState().nodes.find((node) => node.id === id)
      const latestData = latestNode?.type === 'videoGen' ? latestNode.data : data

      updateNodeData(id, {
        prompt: appendPromptFragment(latestData.prompt, fragment),
      })
    },
    [data, id, updateNodeData]
  )

  const handlePreviewSource = useCallback(
    (imageUrl: string, index: number) => {
      openPreview({
        type: 'image',
        src: imageUrl,
        title: `${data.label} - 输入画面 ${index + 1}`,
      })
    },
    [data.label, openPreview]
  )

  const handlePreviewOutput = useCallback(() => {
    if (!data.outputVideo) return

    openPreview({
      type: getPreviewAssetType(data.outputVideo),
      src: data.outputVideo,
      title: `${data.label} - 最新视频结果`,
    })
  }, [data.label, data.outputVideo, openPreview])

  const isProcessing = data.status === 'processing' || data.status === 'queued'
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const needsRefresh = data.needsRefresh === true
  const hasSourceImages = (data.sourceImages ?? []).length > 0
  const hasPrompt = data.prompt.trim().length > 0
  const isBlockedByWorkflowExecution = isWorkflowExecuting && activeExecutionNodeId !== id
  const outputAssetType = data.outputVideo ? getPreviewAssetType(data.outputVideo) : 'video'

  useEffect(() => {
    if (!isProcessing && (!isWorkflowExecuting || activeExecutionNodeId !== id)) {
      blurButtonIfFocused('.generate-btn')
    }
  }, [activeExecutionNodeId, blurButtonIfFocused, id, isProcessing, isWorkflowExecuting])

  return (
    <>
      <NodeWidthResizer
        nodeId={id}
        selected={selected}
        currentWidth={nodeWidth}
        minWidth={DEFAULT_NODE_SIZES.videoGen.width}
      />
      <div
        ref={nodeRef}
        className={`video-gen-node status-${data.status}${needsRefresh ? ' needs-refresh' : ''}${isDisabled ? ' node-disabled' : ''}`}
        style={{ width: nodeWidth }}
      >
        <Handle type="target" position={Position.Left} className="node-handle handle-kind-image" />

      <div className="node-header">
        <VideoCameraOutlined className="node-icon" />
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
        <div className="form-field">
          <label className="field-label">起始画面</label>
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
              请先连接图片上传、图片生成或镜头节点的图像结果，再开始生成视频。
            </div>
          )}
        </div>

        <div className="form-field">
          <div className="field-label-row">
            <label className="field-label">镜头运动描述</label>
            <Button
              type="text"
              size="small"
              icon={<HighlightOutlined />}
              onClick={handleGeneratePrompt}
              loading={isPromptGenerating}
              disabled={isPromptGenerating || isProcessing || isDisabled || isBlockedByWorkflowExecution}
              className="prompt-helper-btn nodrag"
            >
              AI 润色
            </Button>
          </div>
          <NodeTextareaEditor
            variant="native"
            className="prompt-textarea nodrag"
            value={data.prompt}
            onCommit={(value) => updateNodeData(id, { prompt: value })}
            placeholder="描述镜头怎么动、主体怎么动，以及节奏和氛围..."
            rows={3}
          />
          <div className="quick-template-tip">上游图像只会作为起始画面，不会自动继承视频提示词。</div>
        </div>

        <div className="form-field">
          <label className="field-label">快捷模板</label>
          <div className="quick-template-grid">
            {VIDEO_QUICK_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className="quick-template-card"
                onClick={() => handleApplyQuickTemplate(template.id)}
                title={`${template.label}：${template.hint}`}
                disabled={isProcessing || isDisabled || isBlockedByWorkflowExecution}
              >
                <span className="quick-template-title">{template.label}</span>
                <span className="quick-template-hint">{template.hint}</span>
              </button>
            ))}
          </div>
          <div className="quick-chip-row">
            {VIDEO_MOTION_PROMPT_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="quick-chip-button"
                onClick={() => handleApplyMotionChip(chip.prompt)}
                disabled={isProcessing || isDisabled || isBlockedByWorkflowExecution}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="quick-template-tip">点击模板会补入运动描述，并同步建议比例 / 时长 / 运动强度。</div>
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

        {needsRefresh && !isProcessing && (
          <div className="refresh-tip">
            起始画面或当前参数已变化，建议重新生成以同步最新结果。
          </div>
        )}

        {data.outputVideo && (
          <div className="form-field">
            <label className="field-label">最新结果</label>
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
              <span className="video-output-hint">点击查看完整预览</span>
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
                ? '工作流执行中，请稍候'
                : !hasSourceImages
                  ? '请先接入图像输入'
                  : !hasPrompt
                    ? '请先填写视频提示词'
                    : needsRefresh ? '重新生成视频' : '开始生成视频'}
        </Button>
      </div>

        <Handle type="source" position={Position.Right} className="node-handle handle-kind-video" />
      </div>
    </>
  )
})

VideoGenNode.displayName = 'VideoGenNode'

export default VideoGenNode
