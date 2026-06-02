import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  PlayCircleOutlined,
  SyncOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { Button, InputNumber, Progress, Segmented, Select, Switch, message } from 'antd'

import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import { createVideoEditTask } from '../../../services/api'
import type { VideoEditNode as VideoEditNodeType } from '../../../types'
import { getPreviewAssetType } from '../../../utils/media'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTextareaEditor from '../shared/NodeTextareaEditor'
import NodeTitleEditor from '../shared/NodeTitleEditor'
import type { VideoEditNodeData, NodeStatus } from '../../../types'
import './style.css'

const resolutionOptions = [
  { value: '720P', label: '720P' },
  { value: '1080P', label: '1080P' },
]

const v2ResolutionOptions = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
]

const VideoEditNode = memo(({ id, data, selected = false }: NodeProps<VideoEditNodeType>) => {
  const nodeRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const getUpstreamVideos = useFlowStore((state) => state.getUpstreamVideos)
  const getUpstreamImages = useFlowStore((state) => state.getUpstreamImages)
  const edges = useFlowStore((state) => state.edges)
  const isWorkflowExecuting = useFlowStore((state) => state.isWorkflowExecuting)
  const activeExecutionNodeId = useFlowStore((state) => state.activeExecutionNodeId)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.videoGen.width)

  useEffect(() => {
    const upstreamVideos = getUpstreamVideos(id)
    const upstreamImages = getUpstreamImages(id)
    if (upstreamVideos.length > 0) {
      updateNodeData(id, { sourceVideo: upstreamVideos[0] })
    }
    if (upstreamImages.length > 0) {
      updateNodeData(id, { upstreamReferenceImages: upstreamImages })
    }
  }, [edges, getUpstreamVideos, getUpstreamImages, id, updateNodeData])

  const blurButtonIfFocused = useCallback((selector: string) => {
    const root = nodeRef.current
    const activeElement = document.activeElement
    if (!root || !(activeElement instanceof HTMLElement)) return

    const button = root.querySelector<HTMLElement>(selector)
    if (button && activeElement === button) {
      button.blur()
    }
  }, [])

  const handleGenerate = useCallback(async () => {
    const nodeData = useFlowStore.getState().nodes.find((n) => n.id === id)
    if (!nodeData || nodeData.type !== 'videoEdit') return

    const d = nodeData.data as VideoEditNodeData
    const prompt = d.prompt.trim()
    if (!prompt) {
      updateNodeData(id, {
        status: 'error' as NodeStatus,
        errorMessage: '请先填写编辑提示词',
      })
      message.warning('请先填写编辑提示词')
      return
    }

    if (!d.sourceVideo) {
      updateNodeData(id, {
        status: 'error' as NodeStatus,
        errorMessage: '请先连接上游视频输入',
      })
      message.warning('请先连接上游视频输入')
      return
    }

    updateNodeData(id, {
      status: 'queued' as NodeStatus,
      progress: 0,
      errorMessage: undefined,
    })

    try {
      const result = await createVideoEditTask({
        node_id: id,
        prompt,
        source_video: d.sourceVideo,
        reference_images: [...(d.upstreamReferenceImages ?? []), ...(d.referenceImages ?? [])],
        adapter: d.adapter,
        resolution: d.resolution,
        vedit_model: d.veditModel ?? 'happyhorse-1.0-video-edit',
        seedance_version: d.seedanceVersion ?? '1.5',
      })

      updateNodeData(id, {
        status: 'processing' as NodeStatus,
        progress: 10,
      })

      // Poll for task completion
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
          message.success('视频编辑完成')
          return
        }

        updateNodeData(id, {
          status: 'error' as NodeStatus,
          errorMessage: status.error_message ?? '视频编辑失败',
        })
        message.error(status.error_message ?? '视频编辑失败')
      }

      setTimeout(poll, 2000)
    } catch (error) {
      updateNodeData(id, {
        status: 'error' as NodeStatus,
        errorMessage: error instanceof Error ? error.message : '视频编辑任务提交失败',
      })
      message.error(error instanceof Error ? error.message : '视频编辑任务提交失败')
    }
  }, [id, updateNodeData])

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
      if (files.length === 0) return

      const urls = files.map((file) => URL.createObjectURL(file))
      updateNodeData(id, {
        referenceImages: [...(data.referenceImages ?? []), ...urls],
      })
      event.target.value = ''
    },
    [data.referenceImages, id, updateNodeData]
  )

  const handleRemoveReference = useCallback(
    (urlToRemove: string) => {
      const updated = (data.referenceImages ?? []).filter((url) => url !== urlToRemove)
      updateNodeData(id, { referenceImages: updated })
    },
    [data.referenceImages, id, updateNodeData]
  )

  const handlePreviewOutput = useCallback(() => {
    if (!data.outputVideo) return
    openPreview({
      type: getPreviewAssetType(data.outputVideo),
      src: data.outputVideo,
      title: `${data.label} - 编辑结果`,
    })
  }, [data.label, data.outputVideo, openPreview])

  const isProcessing = data.status === 'processing' || data.status === 'queued'
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const needsRefresh = data.needsRefresh === true
  const hasSourceVideo = Boolean(data.sourceVideo)
  const hasPrompt = data.prompt.trim().length > 0
  const isBlockedByWorkflowExecution = isWorkflowExecuting && activeExecutionNodeId !== id
  const seedanceVersion = data.seedanceVersion ?? '1.5'
  const isSeedanceV2 = seedanceVersion === '2.0'
  const canGenerate = hasSourceVideo && hasPrompt

  useEffect(() => {
    if (!isProcessing && (!isWorkflowExecuting || activeExecutionNodeId !== id)) {
      blurButtonIfFocused('.vedit-generate-btn')
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
        className={`video-edit-node status-${data.status}${selected ? ' selected' : ''}${needsRefresh ? ' needs-refresh' : ''}${isDisabled ? ' node-disabled' : ''}`}
        style={{ width: nodeWidth }}
      >
        <Handle type="target" position={Position.Left} className="node-handle handle-kind-video" />
        <Handle type="target" position={Position.Left} id="reference-image" className="node-handle handle-kind-image" />

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
            <label className="field-label">编辑引擎</label>
            <Segmented
              size="small"
              block
              value={seedanceVersion}
              onChange={(value) => {
                const next = value as '1.5' | '2.0'
                if (next === '2.0') {
                  updateNodeData(id, { seedanceVersion: '2.0', adapter: 'volcengine' })
                } else {
                  updateNodeData(id, { seedanceVersion: '1.5', adapter: 'happyhorse' })
                }
              }}
              options={[
                { value: '1.5', label: '传统编辑' },
                { value: '2.0', label: 'Seedance 2.0' },
              ]}
              className="nodrag"
            />
          </div>

          <div className="form-field">
            <label className="field-label">源视频</label>
            {data.sourceVideo ? (
              <div className="vedit-source-video">
                <video
                  className="vedit-source-video-player"
                  src={data.sourceVideo}
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              </div>
            ) : (
              <div className="vedit-source-video-empty">
                请连接视频生成或镜头节点的视频输出，作为编辑源视频。
              </div>
            )}
          </div>

          <div className="form-field">
            <div className="field-label-row">
              <label className="field-label">编辑提示词</label>
            </div>
            <NodeTextareaEditor
              variant="native"
              className="prompt-textarea nodrag"
              value={data.prompt}
              onCommit={(value) => updateNodeData(id, { prompt: value })}
              placeholder="描述要怎样编辑视频，例如：替换背景为夕阳、添加慢动作效果..."
              rows={3}
            />
          </div>

          <div className="form-field">
            <label className="field-label">参考画面（可选）</label>
            {(data.upstreamReferenceImages ?? []).length > 0 || (data.referenceImages ?? []).length > 0 ? (
              <div className="vedit-ref-grid">
                {(data.upstreamReferenceImages ?? []).map((url, index) => (
                  <div key={`up-${index}`} className="vedit-ref-item" title="来自上游连接">
                    <img src={url} alt={`上游参考图 ${index + 1}`} className="vedit-ref-thumb" />
                  </div>
                ))}
                {(data.referenceImages ?? []).map((url, index) => (
                  <div key={`manual-${index}`} className="vedit-ref-item">
                    <img src={url} alt={`参考图 ${index + 1}`} className="vedit-ref-thumb" />
                    <button
                      type="button"
                      className="vedit-ref-remove"
                      onClick={() => handleRemoveReference(url)}
                      disabled={isProcessing}
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="vedit-ref-add"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing || isBlockedByWorkflowExecution}
                >
                  + 添加
                </button>
              </div>
            ) : (
              <div className="vedit-ref-empty" onClick={() => fileInputRef.current?.click()}>
                点击或连接上游图片节点上传参考画面（可选），用于指导视频编辑风格
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </div>

          {isSeedanceV2 ? (
            <>
              <div className="form-row">
                <div className="form-field flex-1">
                  <label className="field-label">输出分辨率</label>
                  <Select
                    size="small"
                    value={data.videoResolution ?? '720p'}
                    onChange={(value) => updateNodeData(id, { videoResolution: value })}
                    options={v2ResolutionOptions}
                    className="field-select nodrag nopan"
                  />
                </div>
                <div className="form-field flex-1">
                  <label className="field-label">时长（秒）</label>
                  <InputNumber
                    size="small"
                    min={4}
                    max={15}
                    step={1}
                    value={data.durationSeconds ?? 5}
                    onChange={(value) => updateNodeData(id, { durationSeconds: value ?? 5 })}
                    className="field-input-number nodrag nopan"
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-field flex-1">
                  <label className="field-label">
                    <span>生成音频</span>
                    <Switch
                      size="small"
                      checked={data.generateAudio ?? true}
                      onChange={(checked) => updateNodeData(id, { generateAudio: checked })}
                      className="nodrag"
                      style={{ marginLeft: 8 }}
                    />
                  </label>
                </div>
                <div className="form-field flex-1">
                  <label className="field-label">
                    <span>返回末帧</span>
                    <Switch
                      size="small"
                      checked={data.returnLastFrame ?? false}
                      onChange={(checked) => updateNodeData(id, { returnLastFrame: checked })}
                      className="nodrag"
                      style={{ marginLeft: 8 }}
                    />
                  </label>
                </div>
              </div>
              <details className="vedit-advanced-params">
                <summary className="vedit-advanced-summary">高级参数</summary>
                <div className="vedit-advanced-content">
                  <div className="form-field">
                    <label className="field-label">随机种子（-1=随机）</label>
                    <InputNumber
                      size="small"
                      min={-1}
                      max={2147483647}
                      step={1}
                      value={data.seed ?? -1}
                      onChange={(value) => updateNodeData(id, { seed: value ?? -1 })}
                      className="field-input-number nodrag nopan"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div className="form-field" style={{ marginTop: 8 }}>
                    <label className="field-label">反向提示词</label>
                    <NodeTextareaEditor
                      variant="native"
                      className="prompt-textarea nodrag"
                      value={data.negativePrompt ?? ''}
                      onCommit={(value) => updateNodeData(id, { negativePrompt: value })}
                      placeholder="描述要避免的内容..."
                      rows={2}
                    />
                  </div>
                  <div className="form-field" style={{ marginTop: 8 }}>
                    <label className="field-label">
                      <span>锁定运镜</span>
                      <Switch
                        size="small"
                        checked={data.cameraFixed ?? false}
                        onChange={(checked) => updateNodeData(id, { cameraFixed: checked })}
                        className="nodrag"
                        style={{ marginLeft: 8 }}
                      />
                    </label>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <div className="form-row">
              <div className="form-field flex-1">
                <label className="field-label">编辑模型</label>
                <Select
                  size="small"
                  value={data.veditModel ?? 'happyhorse-1.0-video-edit'}
                  onChange={(value) => updateNodeData(id, { veditModel: value })}
                  options={[
                    { value: 'happyhorse-1.0-video-edit', label: 'HappyHorse' },
                    { value: 'wan2.7-videoedit', label: '万相 2.7' },
                  ]}
                  className="field-select nodrag nopan"
                />
              </div>
              <div className="form-field flex-1">
                <label className="field-label">输出分辨率</label>
                <Select
                  size="small"
                  value={data.resolution}
                  onChange={(value) => updateNodeData(id, { resolution: value })}
                  options={resolutionOptions}
                  className="field-select nodrag nopan"
                />
              </div>
            </div>
          )}

          {needsRefresh && !isProcessing && (
            <div className="refresh-tip">
              源视频或参数已变化，建议重新编辑以同步最新结果。
            </div>
          )}

          {data.outputVideo && (
            <div className="form-field">
              <label className="field-label">编辑结果</label>
              <button type="button" className="vedit-output-card" onClick={handlePreviewOutput}>
                {getPreviewAssetType(data.outputVideo) === 'video' ? (
                  <video
                    className="vedit-output-media"
                    src={data.outputVideo}
                    muted
                    loop
                    autoPlay
                    playsInline
                  />
                ) : (
                  <img className="vedit-output-media" src={data.outputVideo} alt="编辑结果" />
                )}
                <span className="vedit-output-hint">点击查看完整预览</span>
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
            disabled={isDisabled || isBlockedByWorkflowExecution || !canGenerate}
            className="vedit-generate-btn nodrag"
            icon={<PlayCircleOutlined />}
          >
            {data.status === 'queued'
              ? '排队中...'
              : isProcessing || (isWorkflowExecuting && activeExecutionNodeId === id)
                ? '编辑中...'
                : isBlockedByWorkflowExecution
                  ? '工作流执行中，请稍候'
                  : !hasSourceVideo
                    ? '请先接入源视频'
                    : !hasPrompt
                      ? '请先填写编辑提示词'
                      : needsRefresh ? '重新编辑' : '开始编辑'}
          </Button>
        </div>

        <Handle type="source" position={Position.Right} className="node-handle handle-kind-video" />
      </div>
    </>
  )
})

VideoEditNode.displayName = 'VideoEditNode'

export default VideoEditNode
