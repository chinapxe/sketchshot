import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  DownOutlined,
  HighlightOutlined,
  PlayCircleOutlined,
  SyncOutlined,
  TeamOutlined,
  UpOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { Button, Input, InputNumber, Progress, Segmented, Select, Switch, message } from 'antd'

import {
  VIDEO_MOTION_PROMPT_CHIPS,
  VIDEO_QUICK_TEMPLATES,
  appendPromptFragment,
  appendPromptLine,
} from '../../../config/generationQuickPresets'
import {
  getSupportedVideoAdapterValue,
  resolveVisibleVideoAdapter,
  supportedVideoAdapterOptions,
  type SupportedVideoAdapter,
} from '../../../services/engineSettings'
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

const durationOptionsV2 = [
  { value: 4, label: '4 秒' },
  { value: 5, label: '5 秒' },
  { value: 8, label: '8 秒' },
  { value: 10, label: '10 秒' },
  { value: 12, label: '12 秒' },
  { value: 15, label: '15 秒' },
]

const videoResolutionOptions = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
]

const happyhorseModeOptions = [
  { value: 't2v', label: '文生视频 (T2V)' },
  { value: 'i2v', label: '图生视频 (I2V)' },
  { value: 'r2v', label: '参考生视频 (R2V)' },
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
  const [adapterValue, setAdapterValue] = useState<SupportedVideoAdapter>(() => getSupportedVideoAdapterValue(data.adapter))
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const isHappyHorse = adapterValue === 'happyhorse'
  const happyhorseMode = data.happyhorseMode || (isHappyHorse ? 't2v' : undefined)
  const isVolcengine = adapterValue === 'volcengine'
  const seedanceVersion = data.seedanceVersion || '1.5'
  const isSeedanceV2 = isVolcengine && seedanceVersion === '2.0'
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.videoGen.width)

  useEffect(() => {
    updateNodeData(id, { sourceImages: getUpstreamImages(id) })
  }, [edges, getUpstreamImages, id, updateNodeData])

  useEffect(() => () => disconnectVideoGeneration(id), [id])

  useEffect(() => {
    let cancelled = false

    void resolveVisibleVideoAdapter(data.adapter).then((value) => {
      if (!cancelled) {
        setAdapterValue(value)
      }
    })

    return () => {
      cancelled = true
    }
  }, [data.adapter])

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

  const handlePreviewLastFrame = useCallback(() => {
    if (!data.outputLastFrame) return

    openPreview({
      type: 'image',
      src: data.outputLastFrame,
      title: `${data.label} - 末帧画面`,
    })
  }, [data.label, data.outputLastFrame, openPreview])

  const handlePreviewReferenceVideo = useCallback(
    (videoUrl: string) => {
      openPreview({
        type: 'video',
        src: videoUrl,
        title: `${data.label} - 参考视频`,
      })
    },
    [data.label, openPreview]
  )

  const isProcessing = data.status === 'processing' || data.status === 'queued'
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const needsRefresh = data.needsRefresh === true
  const hasSourceImages = (data.sourceImages ?? []).length > 0
  const hasPrompt = data.prompt.trim().length > 0
  const isBlockedByWorkflowExecution = isWorkflowExecuting && activeExecutionNodeId !== id
  const outputAssetType = data.outputVideo ? getPreviewAssetType(data.outputVideo) : 'video'
  const happyhorseNeedsImages = !isHappyHorse || happyhorseMode !== 't2v'
  const happyhorseSourceLabel = isHappyHorse && happyhorseMode === 'r2v' ? '参考画面' : '起始画面'
  const referenceVideos = (data.referenceVideos ?? []).slice(0, 1)
  const referenceAudios = (data.referenceAudios ?? []).slice(0, 1)
  const hasReferenceVideo = referenceVideos.length > 0
  const hasReferenceAudio = referenceAudios.length > 0
  const refAudioMissingCarrier = isSeedanceV2 && hasReferenceAudio && !hasSourceImages && !hasReferenceVideo
  const canGenerate = isHappyHorse && happyhorseMode === 't2v'
    ? hasPrompt
    : (hasSourceImages && hasPrompt && !refAudioMissingCarrier)

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
        className={`video-gen-node status-${data.status}${selected ? ' selected' : ''}${needsRefresh ? ' needs-refresh' : ''}${isDisabled ? ' node-disabled' : ''}`}
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
          <label className="field-label">{happyhorseSourceLabel}</label>
          {isHappyHorse && happyhorseMode === 't2v' ? (
            <div className="video-empty-panel">
              T2V 文生视频模式无需图片输入，填写提示词即可直接生成视频。
            </div>
          ) : hasSourceImages ? (
            <div className="video-source-grid">
              {(data.sourceImages ?? []).map((imageUrl, index) => (
                <button
                  key={`${imageUrl}-${index}`}
                  type="button"
                  className="video-source-button"
                  onClick={() => handlePreviewSource(imageUrl, index)}
                >
                  {/^(https?:|\/)/.test(imageUrl) ? (
                    <img src={imageUrl} alt={`源图 ${index + 1}`} className="video-source-thumb" />
                  ) : (
                    <div className="video-source-thumb video-source-placeholder">
                      <TeamOutlined />
                    </div>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="video-empty-panel">
              请先连接图片上传、图片生成或镜头节点的图像结果，再开始生成视频。
            </div>
          )}
          {isHappyHorse && happyhorseMode === 'i2v' && (data.sourceImages?.length ?? 0) > 1 && (
            <div className="quick-template-tip" style={{ color: '#ad6800' }}>
              I2V 模式仅使用第一张图作为起始帧，其余 {data.sourceImages!.length - 1} 张不会被使用。多图生视频请切换至 R2V（参考生视频）模式。
            </div>
          )}
          {isHappyHorse && happyhorseMode === 'r2v' && hasSourceImages && (
            <div className="quick-template-tip">
              可在提示词中用 [Image 1]、[Image 2] 等编号精确引用上方的参考画面，如「[Image 1]中的人物穿上[Image 2]中的外套」。
            </div>
          )}
        </div>

        {isSeedanceV2 && (data.sourceImages?.length ?? 0) >= 2 && (
          <div className="form-field">
            <label className="field-label">多图角色</label>
            <Segmented
              size="small"
              block
              disabled={hasReferenceVideo || hasReferenceAudio}
              value={(hasReferenceVideo || hasReferenceAudio) ? 'reference' : (data.multiImageRole || 'transition')}
              onChange={(value) =>
                updateNodeData(id, { multiImageRole: value as 'transition' | 'reference' })
              }
              options={[
                { value: 'transition', label: '首尾过渡' },
                { value: 'reference', label: '全部参考' },
              ]}
              className="nodrag"
            />
            <div className="quick-template-tip">
              {hasReferenceVideo || hasReferenceAudio
                ? 'R2V 模式下所有图像统一作为参考图，此开关已锁定。'
                : (data.multiImageRole || 'transition') === 'transition'
                  ? '首图/末图作首尾关键帧，中间图作参考；适合制作 A→B 过渡动画。'
                  : '所有图像作为参考，模型综合内容/风格生成自由动画。'}
            </div>
          </div>
        )}

        {isSeedanceV2 && (
          <div className="form-field">
            <label className="field-label">参考视频（可选）</label>
            {hasReferenceVideo ? (
              <div className="video-source-grid">
                {referenceVideos.map((videoUrl, index) => (
                  <button
                    key={`${videoUrl}-${index}`}
                    type="button"
                    className="video-source-button vref-video-button"
                    onClick={() => handlePreviewReferenceVideo(videoUrl)}
                    title="点击预览参考视频"
                  >
                    <video
                      className="video-source-thumb"
                      src={videoUrl}
                      muted
                      preload="metadata"
                    />
                  </button>
                ))}
              </div>
            ) : (
              <div className="video-empty-panel vref-empty">
                可选：连接视频上传 / 上一段视频生成 / 视频编辑节点，作为参考视频（建议 2-15s / 480-720p / 无真人脸）。
              </div>
            )}
          </div>
        )}

        {isSeedanceV2 && (
          <div className="form-field">
            <label className="field-label">参考音频（可选）</label>
            {hasReferenceAudio ? (
              <div className="vref-audio-list">
                {referenceAudios.map((audioUrl, index) => (
                  <div key={`${audioUrl}-${index}`} className="vref-audio-item">
                    <audio
                      controls
                      preload="metadata"
                      src={audioUrl}
                      className="vref-audio-player"
                    />
                  </div>
                ))}
                {refAudioMissingCarrier && (
                  <div className="vref-audio-warning">
                    参考音频必须搭配至少一张图像或一段参考视频。
                  </div>
                )}
              </div>
            ) : (
              <div className="video-empty-panel vref-empty">
                可选：连接 TTS 或数字人节点的音频输出作为参考音频（必须搭配图像或参考视频）。
              </div>
            )}
          </div>
        )}

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
          <div className="quick-template-tip">上游图像只会作为起始画面，不会自动继承视频提示词；可先手写，或点“AI 润色”生成一版运动描述。</div>
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
              options={isSeedanceV2 ? durationOptionsV2 : durationOptions}
              className="field-select nodrag nopan"
            />
          </div>
          <div className="form-field flex-1">
            <label className="field-label">视频引擎</label>
            <Select
              size="small"
              value={adapterValue}
              onChange={(value) => updateNodeData(id, { adapter: value })}
              options={supportedVideoAdapterOptions}
              className="field-select nodrag nopan"
            />
          </div>
        </div>

        <div className="form-field">
          <label className="field-label">非真人风格</label>
          <div className="seedance-audio-switch">
            <Switch
              size="small"
              checked={data.nonRealisticStyle === true}
              onChange={(checked) => updateNodeData(id, { nonRealisticStyle: checked })}
              className="nodrag"
            />
            <span className="seedance-audio-hint">
              {data.nonRealisticStyle === true
                ? '已注入 3D/CG 风格提示词，避免生成真人画面'
                : '关闭后按原始提示词生成，可能触发合规拦截'}
            </span>
          </div>
        </div>

        {isHappyHorse && (
          <>
            <div className="form-field">
              <label className="field-label">HappyHorse 生成模式</label>
              <Select
                size="small"
                value={happyhorseMode}
                onChange={(value) => updateNodeData(id, { happyhorseMode: value })}
                options={happyhorseModeOptions}
                className="field-select nodrag nopan"
              />
            </div>

            <div className="form-field">
              <label className="field-label">原生音频</label>
              <div className="seedance-audio-switch">
                <Switch
                  size="small"
                  checked={data.happyhorseWithAudio !== false}
                  onChange={(checked) => updateNodeData(id, { happyhorseWithAudio: checked })}
                  className="nodrag"
                />
                <span className="seedance-audio-hint">
                  {data.happyhorseWithAudio !== false
                    ? '根据 prompt 自动生成口型同步音频，支持中英日韩等 7 种语言'
                    : '仅生成画面，不生成音频'}
                </span>
              </div>
            </div>

            <div className="form-field">
              <label className="field-label">画质模式</label>
              <Segmented
                size="small"
                options={[
                  { value: 'pro', label: '质量优先' },
                  { value: 'std', label: '速度优先' },
                ]}
                value={data.happyhorseQualityMode || 'pro'}
                onChange={(value) => {
                  const mode = value as 'pro' | 'std'
                  const patch: Partial<VideoGenNodeType['data']> = { happyhorseQualityMode: mode }
                  if (mode === 'std' && data.videoResolution === '1080p') {
                    patch.videoResolution = '720p'
                  }
                  updateNodeData(id, patch)
                }}
                className="nodrag nopan"
                block
              />
            </div>

            <div className="form-field">
              <label className="field-label">输出分辨率</label>
              <Select
                size="small"
                value={data.videoResolution || '720p'}
                onChange={(value) => updateNodeData(id, { videoResolution: value as '480p' | '720p' | '1080p' })}
                options={
                  (data.happyhorseQualityMode || 'pro') === 'std'
                    ? videoResolutionOptions.filter((opt) => opt.value !== '1080p')
                    : videoResolutionOptions
                }
                className="field-select nodrag nopan"
              />
            </div>

            <div className="form-field">
              <button
                type="button"
                className="seedance-advanced-toggle nodrag"
                onClick={() => setIsAdvancedOpen((prev) => !prev)}
              >
                <span>高级参数</span>
                {isAdvancedOpen ? <UpOutlined /> : <DownOutlined />}
              </button>
            </div>

            {isAdvancedOpen && (
              <div className="seedance-advanced-panel">
                <div className="form-field">
                  <label className="field-label">随机种子</label>
                  <InputNumber
                    size="small"
                    value={data.seed ?? -1}
                    min={-1}
                    max={2147483647}
                    step={1}
                    onChange={(value) => updateNodeData(id, { seed: typeof value === 'number' ? value : -1 })}
                    className="nodrag"
                    style={{ width: '100%' }}
                    placeholder="-1 = 随机"
                  />
                </div>
              </div>
            )}
          </>
        )}

        {isVolcengine && (
          <div className="form-field">
            <label className="field-label">Seedance 版本</label>
            <Segmented
              size="small"
              options={[
                { value: '1.5', label: '1.5' },
                { value: '2.0', label: '2.0' },
              ]}
              value={seedanceVersion}
              onChange={(value) => updateNodeData(id, { seedanceVersion: value as '1.5' | '2.0' })}
              className="nodrag nopan"
              block
            />
          </div>
        )}

        {isSeedanceV2 && (
          <>
            <div className="form-field">
              <label className="field-label">模型档位</label>
              <Segmented
                size="small"
                options={[
                  { value: 'standard', label: '标准版' },
                  { value: 'fast', label: '极速版' },
                ]}
                value={data.videoModelTier || 'standard'}
                onChange={(value) => {
                  const tier = value as 'standard' | 'fast'
                  const patch: Partial<VideoGenNodeType['data']> = { videoModelTier: tier }
                  if (tier === 'fast' && data.videoResolution === '1080p') {
                    patch.videoResolution = '720p'
                  }
                  updateNodeData(id, patch)
                }}
                className="nodrag nopan"
                block
              />
            </div>

            <div className="form-row">
              <div className="form-field flex-1">
                <label className="field-label">输出分辨率</label>
                <Select
                  size="small"
                  value={data.videoResolution || '720p'}
                  onChange={(value) => updateNodeData(id, { videoResolution: value as '480p' | '720p' | '1080p' })}
                  options={
                    (data.videoModelTier || 'standard') === 'fast'
                      ? videoResolutionOptions.filter((opt) => opt.value !== '1080p')
                      : videoResolutionOptions
                  }
                  className="field-select nodrag nopan"
                />
              </div>
              <div className="form-field flex-1">
                <label className="field-label">生成音频</label>
                <div className="seedance-audio-switch">
                  <Switch
                    size="small"
                    checked={data.generateAudio !== false}
                    onChange={(checked) => updateNodeData(id, { generateAudio: checked })}
                    className="nodrag"
                  />
                  <span className="seedance-audio-hint">{data.generateAudio !== false ? '同步生成环境音' : '仅生成画面'}</span>
                </div>
              </div>
            </div>

            <div className="form-field">
              <button
                type="button"
                className="seedance-advanced-toggle nodrag"
                onClick={() => setIsAdvancedOpen((prev) => !prev)}
              >
                <span>高级参数</span>
                {isAdvancedOpen ? <UpOutlined /> : <DownOutlined />}
              </button>
            </div>

            {isAdvancedOpen && (
              <div className="seedance-advanced-panel">
                <div className="form-field">
                  <label className="field-label">反向提示词</label>
                  <Input.TextArea
                    size="small"
                    rows={2}
                    value={data.negativePrompt || ''}
                    onChange={(event) => updateNodeData(id, { negativePrompt: event.target.value })}
                    placeholder="希望避免的内容，如 模糊、低清、变形 等"
                    className="nodrag nopan"
                  />
                </div>
                <div className="form-row">
                  <div className="form-field flex-1">
                    <label className="field-label">随机种子</label>
                    <InputNumber
                      size="small"
                      value={data.seed ?? -1}
                      min={-1}
                      max={2147483647}
                      step={1}
                      onChange={(value) => updateNodeData(id, { seed: typeof value === 'number' ? value : -1 })}
                      className="nodrag"
                      style={{ width: '100%' }}
                      placeholder="-1 = 随机"
                    />
                  </div>
                  <div className="form-field flex-1">
                    <label className="field-label">固定运镜</label>
                    <div className="seedance-audio-switch">
                      <Switch
                        size="small"
                        checked={data.cameraFixed === true}
                        onChange={(checked) => updateNodeData(id, { cameraFixed: checked })}
                        className="nodrag"
                      />
                      <span className="seedance-audio-hint">{data.cameraFixed === true ? '锁定机位' : '允许运镜'}</span>
                    </div>
                  </div>
                </div>
                <div className="form-field">
                  <label className="field-label">返回末帧</label>
                  <div className="seedance-audio-switch">
                    <Switch
                      size="small"
                      checked={data.returnLastFrame === true}
                      onChange={(checked) => updateNodeData(id, { returnLastFrame: checked })}
                      className="nodrag"
                    />
                    <span className="seedance-audio-hint">
                      {data.returnLastFrame === true
                        ? '同时输出末帧图像，可从右侧末帧端口接入下一段视频'
                        : '仅输出视频；开启后会多出"末帧"输出端口'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

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

        {isSeedanceV2 && data.outputLastFrame && (
          <div className="form-field">
            <label className="field-label">末帧画面</label>
            <button type="button" className="video-lastframe-card" onClick={handlePreviewLastFrame}>
              <img className="video-lastframe-media" src={data.outputLastFrame} alt={`${data.label} 末帧`} />
              <span className="video-output-hint">从右下角"末帧"端口接入下一段视频</span>
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
          className="generate-btn nodrag"
          icon={<PlayCircleOutlined />}
        >
          {data.status === 'queued'
            ? '排队中...'
            : isProcessing || (isWorkflowExecuting && activeExecutionNodeId === id)
              ? '生成中...'
              : isBlockedByWorkflowExecution
                ? '工作流执行中，请稍候'
                : happyhorseNeedsImages && !hasSourceImages
                  ? '请先接入图像输入'
                  : !hasPrompt
                    ? '请先填写视频提示词'
                    : refAudioMissingCarrier
                      ? '参考音频需配合图像或参考视频'
                      : needsRefresh ? '重新生成视频' : '开始生成视频'}
        </Button>
      </div>

        <Handle type="source" position={Position.Right} className="node-handle handle-kind-video video-handle-main" />
        {isSeedanceV2 && data.returnLastFrame === true && (
          <Handle
            type="source"
            position={Position.Right}
            id="lastFrame"
            className="node-handle handle-kind-image video-handle-lastframe"
            title="末帧（图像）→ 可作为下一段视频的起始画面"
          />
        )}
      </div>
    </>
  )
})

VideoGenNode.displayName = 'VideoGenNode'

export default VideoGenNode
