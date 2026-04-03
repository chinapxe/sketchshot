import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import {
  CameraOutlined,
  DownOutlined,
  HighlightOutlined,
  PlayCircleOutlined,
  ProfileOutlined,
  SyncOutlined,
  UpOutlined,
} from '@ant-design/icons'
import { Button, Input, InputNumber, Progress, Select, Slider, Switch, message } from 'antd'

import { generateShotPrompt } from '../../../services/promptGeneration'
import { disconnectShotGeneration, executeShotNode } from '../../../services/storyboardGeneration'
import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import { getShotContext } from '../../../utils/storyboard'
import type { ShotNode as ShotNodeType } from '../../../types'
import '../storyboard.css'

const { TextArea } = Input

const shotSizeOptions = [
  { value: 'extreme-close-up', label: '特写' },
  { value: 'close-up', label: '近景' },
  { value: 'medium', label: '中景' },
  { value: 'wide', label: '远景' },
  { value: 'establishing', label: '大全景' },
]

const cameraAngleOptions = [
  { value: 'eye-level', label: '平视' },
  { value: 'low-angle', label: '低机位' },
  { value: 'high-angle', label: '高机位' },
  { value: 'over-shoulder', label: '肩后视角' },
  { value: 'top-down', label: '俯拍' },
]

const aspectRatioOptions = [
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
]

const resolutionOptions = [
  { value: '1K', label: '1K' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
]

const outputTypeOptions = [
  { value: 'image', label: '图像' },
  { value: 'video', label: '视频' },
]

const imageAdapterOptions = [
  { value: 'volcengine', label: '火山引擎' },
  { value: 'comfyui', label: 'ComfyUI' },
  { value: 'mock', label: '模拟模式' },
]

const videoAdapterOptions = [
  { value: 'volcengine', label: '火山引擎' },
  { value: 'mock', label: '模拟模式' },
]

const ShotNode = memo(({ id, data }: NodeProps<ShotNodeType>) => {
  const nodeRef = useRef<HTMLDivElement>(null)
  const [isPromptGenerating, setIsPromptGenerating] = useState(false)
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const toggleNodeCollapsed = useFlowStore((state) => state.toggleNodeCollapsed)
  const nodes = useFlowStore((state) => state.nodes)
  const edges = useFlowStore((state) => state.edges)
  const isWorkflowExecuting = useFlowStore((state) => state.isWorkflowExecuting)
  const activeExecutionNodeId = useFlowStore((state) => state.activeExecutionNodeId)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const updateNodeInternals = useUpdateNodeInternals()

  const shotContext = useMemo(() => getShotContext(id, nodes, edges), [edges, id, nodes])
  const referenceAssetOptions = useMemo(
    () =>
      shotContext.referenceAssets.map((asset) => ({
        value: asset.url,
        label: `${asset.title} · ${asset.relation}`,
      })),
    [shotContext.referenceAssets]
  )
  const isCollapsed = data.collapsed === true
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const isProcessing = data.status === 'processing' || data.status === 'queued'
  const isBlockedByWorkflowExecution = isWorkflowExecuting && activeExecutionNodeId !== id
  const needsRefresh = data.needsRefresh === true
  const canUseIdentityLock = shotContext.referenceImages.length > 0
  const shotSizeLabel = shotSizeOptions.find((item) => item.value === data.shotSize)?.label ?? data.shotSize
  const cameraAngleLabel =
    cameraAngleOptions.find((item) => item.value === data.cameraAngle)?.label ?? data.cameraAngle
  const filledContinuityCount = (data.continuityFrames ?? []).filter((value) => value.trim().length > 0).length
  const outputTypeLabel = data.outputType === 'video' ? '视频' : '图像'
  const hasOutput = data.outputType === 'video' ? Boolean(data.outputVideo) : Boolean(data.outputImage)

  useEffect(() => {
    window.requestAnimationFrame(() => updateNodeInternals(id))
  }, [id, isCollapsed, updateNodeInternals])

  useEffect(() => () => disconnectShotGeneration(id), [id])

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
    if (!isProcessing && (!isWorkflowExecuting || activeExecutionNodeId !== id)) {
      blurButtonIfFocused('.shot-generate-btn')
    }
  }, [activeExecutionNodeId, blurButtonIfFocused, id, isProcessing, isWorkflowExecuting])

  useEffect(() => {
    if (!isPromptGenerating) {
      blurButtonIfFocused('.shot-prompt-helper-btn')
    }
  }, [blurButtonIfFocused, isPromptGenerating])

  const updateField = useCallback(
    (field: string, value: string | number | boolean | undefined) => {
      updateNodeData(id, { [field]: value })
    },
    [id, updateNodeData]
  )

  const updateContinuityFrame = useCallback(
    (index: number, value: string) => {
      const nextFrames = [...(data.continuityFrames ?? Array.from({ length: 9 }, () => ''))]
      nextFrames[index] = value
      updateNodeData(id, { continuityFrames: nextFrames })
    },
    [data.continuityFrames, id, updateNodeData]
  )

  const handleToggleCollapsed = useCallback(() => {
    toggleNodeCollapsed(id)
  }, [id, toggleNodeCollapsed])

  const handleGenerate = useCallback(async () => {
    try {
      await executeShotNode(id)
    } catch (error) {
      console.error(`[shot:${id}] execute failed:`, error)
    }
  }, [id])

  const handleGeneratePrompt = useCallback(async () => {
    setIsPromptGenerating(true)

    try {
      const latestNodes = useFlowStore.getState().nodes
      const latestEdges = useFlowStore.getState().edges
      const latestNode = latestNodes.find((node) => node.id === id)

      if (!latestNode || latestNode.type !== 'shot') {
        throw new Error('镜头节点不存在')
      }

      const latestContext = getShotContext(id, latestNodes, latestEdges)
      const generatedPrompt = await generateShotPrompt(latestNode.data, latestContext)
      updateNodeData(id, { prompt: generatedPrompt })
      message.success('镜头提示词已优化')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '镜头提示词优化失败'
      message.error(errorMessage)
    } finally {
      setIsPromptGenerating(false)
    }
  }, [id, updateNodeData])

  const handlePreviewOutput = useCallback(() => {
    if (data.outputType === 'video' && data.outputVideo) {
      openPreview({
        type: 'video',
        src: data.outputVideo,
        title: data.title || data.label,
      })
      return
    }

    if (data.outputType === 'image' && data.outputImage) {
      openPreview({
        type: 'image',
        src: data.outputImage,
        title: data.title || data.label,
      })
    }
  }, [data.label, data.outputImage, data.outputType, data.outputVideo, data.title, openPreview])

  const summaryTitle = data.title.trim() || '未填写镜头标题'
  const summaryDescription = data.description.trim() || '未填写镜头描述'

  return (
    <div
      ref={nodeRef}
      className={`storyboard-node status-${data.status}${needsRefresh ? ' needs-refresh' : ''}${isDisabled ? ' node-disabled' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="storyboard-handle" />

      <div className="storyboard-node-header">
        <span className="storyboard-node-icon">
          <CameraOutlined />
        </span>
        <div className="storyboard-node-title-wrap">
          <div className="storyboard-node-title">{data.label}</div>
          <div className="storyboard-node-subtitle">以镜头语言组织生成，而不是直接堆参数</div>
        </div>
        <div className="storyboard-node-actions">
          {needsRefresh && !isProcessing && (
            <span className="storyboard-badge refresh">
              <SyncOutlined />
              待刷新
            </span>
          )}
          {isDisabled && <span className="storyboard-badge disabled">已禁用</span>}
          <Button
            type="text"
            size="small"
            icon={isCollapsed ? <DownOutlined /> : <UpOutlined />}
            onClick={handleToggleCollapsed}
            className="storyboard-collapse-btn nodrag"
          >
            {isCollapsed ? '展开' : '折叠'}
          </Button>
        </div>
      </div>

      {isCollapsed ? (
        <div className="storyboard-node-body storyboard-node-body-collapsed nodrag nopan nowheel">
          <div className="storyboard-summary-title">{summaryTitle}</div>
          <div className="storyboard-summary-item">
            <span className="storyboard-summary-label">镜头</span>
            <span className="storyboard-summary-value">{summaryDescription}</span>
          </div>
          <div className="storyboard-summary-item">
            <span className="storyboard-summary-label">规格</span>
            <span className="storyboard-summary-value">
              {outputTypeLabel} / {shotSizeLabel} / {cameraAngleLabel}
            </span>
          </div>
          <div className="storyboard-summary-tags">
            <span className="storyboard-summary-tag">{data.motion.trim() || '待写动作'}</span>
            <span className="storyboard-summary-tag">{data.emotion.trim() || '待写情绪'}</span>
            <span className="storyboard-summary-tag">参考 {shotContext.referenceAssets.length}</span>
            <span className="storyboard-summary-tag">承接 {shotContext.previousShots.length}</span>
            {data.outputType === 'video' && (
              <span className="storyboard-summary-tag">九宫格 {filledContinuityCount}/9</span>
            )}
            {data.videoFirstFrame && <span className="storyboard-summary-tag">有首帧</span>}
            {data.videoLastFrame && <span className="storyboard-summary-tag">有尾帧</span>}
            {data.prompt.trim() && <span className="storyboard-summary-tag">已补提示</span>}
            {hasOutput && <span className="storyboard-summary-tag success">已有结果</span>}
          </div>

          {(data.status === 'processing' || data.status === 'queued') && (
            <div className="storyboard-progress">
              <Progress
                percent={data.progress}
                size="small"
                status={data.status === 'queued' ? 'normal' : 'active'}
                strokeColor="#8b5e1a"
              />
            </div>
          )}

          {data.status === 'error' && data.errorMessage && (
            <div className="storyboard-error">{data.errorMessage}</div>
          )}

          {hasOutput && (
            <div className="storyboard-summary-actions">
              <Button size="small" onClick={handlePreviewOutput} className="nodrag">
                查看结果
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="storyboard-node-body nodrag nopan nowheel">
          <div className="storyboard-field">
            <label className="storyboard-field-label">镜头标题</label>
            <Input
              value={data.title}
              onChange={(event) => updateField('title', event.target.value)}
              placeholder="例如：屋顶对峙 - 主角回头"
              className="storyboard-input"
            />
          </div>

          <div className="storyboard-field">
            <label className="storyboard-field-label">镜头描述</label>
            <TextArea
              value={data.description}
              onChange={(event) => updateField('description', event.target.value)}
              placeholder="描述这个镜头真正要表现的画面与行为"
              autoSize={{ minRows: 3, maxRows: 6 }}
              className="storyboard-textarea"
            />
          </div>

          <div className="storyboard-field">
            <div className="field-label-row">
              <label className="storyboard-field-label">补充提示</label>
              <Button
                type="text"
                size="small"
                icon={<HighlightOutlined />}
                onClick={handleGeneratePrompt}
                loading={isPromptGenerating}
                disabled={isPromptGenerating || isProcessing || isDisabled || isBlockedByWorkflowExecution}
                className="prompt-helper-btn shot-prompt-helper-btn nodrag"
              >
                AI 优化
              </Button>
            </div>
            <TextArea
              value={data.prompt}
              onChange={(event) => updateField('prompt', event.target.value)}
              placeholder="补充道具、镜头运动、场景细节、氛围词等"
              autoSize={{ minRows: 2, maxRows: 4 }}
              className="storyboard-textarea"
            />
          </div>

          <div className="storyboard-row">
            <div className="storyboard-field">
              <label className="storyboard-field-label">景别</label>
              <Select
                value={data.shotSize}
                onChange={(value) => updateField('shotSize', value)}
                options={shotSizeOptions}
                className="storyboard-select nodrag nopan"
              />
            </div>
            <div className="storyboard-field">
              <label className="storyboard-field-label">机位</label>
              <Select
                value={data.cameraAngle}
                onChange={(value) => updateField('cameraAngle', value)}
                options={cameraAngleOptions}
                className="storyboard-select nodrag nopan"
              />
            </div>
          </div>

          <div className="storyboard-row">
            <div className="storyboard-field">
              <label className="storyboard-field-label">动作</label>
              <Input
                value={data.motion}
                onChange={(event) => updateField('motion', event.target.value)}
                placeholder="例如：缓慢回头、风吹衣摆"
                className="storyboard-input"
              />
            </div>
            <div className="storyboard-field">
              <label className="storyboard-field-label">情绪</label>
              <Input
                value={data.emotion}
                onChange={(event) => updateField('emotion', event.target.value)}
                placeholder="例如：压抑、决绝、迷惘"
                className="storyboard-input"
              />
            </div>
          </div>

          <div className="storyboard-row">
            <div className="storyboard-field">
              <label className="storyboard-field-label">输出类型</label>
              <Select
                value={data.outputType}
                onChange={(value) => updateField('outputType', value)}
                options={outputTypeOptions}
                className="storyboard-select nodrag nopan"
              />
            </div>
            <div className="storyboard-field">
              <label className="storyboard-field-label">画面比例</label>
              <Select
                value={data.aspectRatio}
                onChange={(value) => updateField('aspectRatio', value)}
                options={aspectRatioOptions}
                className="storyboard-select nodrag nopan"
              />
            </div>
          </div>

          {data.outputType === 'image' ? (
            <>
              <div className="storyboard-row">
                <div className="storyboard-field">
                  <label className="storyboard-field-label">分辨率</label>
                  <Select
                    value={data.resolution}
                    onChange={(value) => updateField('resolution', value)}
                    options={resolutionOptions}
                    className="storyboard-select nodrag nopan"
                  />
                </div>
                <div className="storyboard-field">
                  <label className="storyboard-field-label">图像适配器</label>
                  <Select
                    value={data.imageAdapter}
                    onChange={(value) => updateField('imageAdapter', value)}
                    options={imageAdapterOptions}
                    className="storyboard-select nodrag nopan"
                  />
                </div>
              </div>

              <div className="storyboard-field">
                <label className="storyboard-field-label">角色一致性</label>
                <Switch
                  checked={data.identityLock}
                  disabled={!canUseIdentityLock}
                  onChange={(checked) => updateField('identityLock', checked)}
                  className="nodrag"
                />
                {!canUseIdentityLock && (
                  <div className="storyboard-note">连接角色设定参考图、上传图或上游图像结果后可启用一致性锁定。</div>
                )}
              </div>

              {canUseIdentityLock && data.identityLock && (
                <div className="storyboard-field">
                  <label className="storyboard-field-label">一致性强度</label>
                  <Slider
                    min={0}
                    max={1}
                    step={0.05}
                    value={data.identityStrength}
                    onChange={(value) => updateField('identityStrength', Number(value))}
                    tooltip={{ formatter: (value) => `${Math.round((value ?? 0) * 100)}%` }}
                    className="nodrag"
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="storyboard-row">
                <div className="storyboard-field">
                  <label className="storyboard-field-label">时长（秒）</label>
                  <InputNumber
                    min={1}
                    max={12}
                    value={data.durationSeconds}
                    onChange={(value) => updateField('durationSeconds', Number(value ?? 4))}
                    className="storyboard-number nodrag"
                  />
                </div>
                <div className="storyboard-field">
                  <label className="storyboard-field-label">视频适配器</label>
                  <Select
                    value={data.videoAdapter}
                    onChange={(value) => updateField('videoAdapter', value)}
                    options={videoAdapterOptions}
                    className="storyboard-select nodrag nopan"
                  />
                </div>
              </div>

              <div className="storyboard-field">
                <label className="storyboard-field-label">运动强度</label>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={data.motionStrength}
                  onChange={(value) => updateField('motionStrength', Number(value))}
                  tooltip={{ formatter: (value) => `${Math.round((value ?? 0) * 100)}%` }}
                  className="nodrag"
                />
              </div>

              <div className="storyboard-row">
                <div className="storyboard-field">
                  <label className="storyboard-field-label">首帧约束</label>
                  <Select
                    allowClear
                    value={data.videoFirstFrame}
                    options={referenceAssetOptions}
                    onChange={(value) => updateField('videoFirstFrame', value)}
                    placeholder="选择视频起始画面"
                    className="storyboard-select nodrag nopan"
                  />
                </div>
                <div className="storyboard-field">
                  <label className="storyboard-field-label">尾帧约束</label>
                  <Select
                    allowClear
                    value={data.videoLastFrame}
                    options={referenceAssetOptions}
                    onChange={(value) => updateField('videoLastFrame', value)}
                    placeholder="选择视频收束画面"
                    className="storyboard-select nodrag nopan"
                  />
                </div>
              </div>

              <div className="storyboard-note">
                只设置一个约束图时，会按单图视频方式起步或收束；同时设置首帧和尾帧时，系统会按首尾帧约束提交。
                {shotContext.previousShots.length > 0
                  ? ` 当前已承接上游镜头 ${shotContext.previousShots.map((shot) => shot.title).join(' / ')}。`
                  : ''}
              </div>

              <div className="storyboard-field">
                <label className="storyboard-field-label">九宫格连续动作</label>
                <div className="storyboard-note">
                  用 9 格拆解同一个镜头里的连续动作推进，重点描述起势、过程、停顿、转折和收势。
                </div>
                <div className="storyboard-nine-grid">
                  {(data.continuityFrames ?? Array.from({ length: 9 }, () => '')).map((frame, index) => (
                    <div key={index} className="storyboard-nine-grid-card">
                      <div className="storyboard-nine-grid-index">{index + 1}</div>
                      <TextArea
                        value={frame}
                        onChange={(event) => updateContinuityFrame(index, event.target.value)}
                        placeholder={`第 ${index + 1} 格动作`}
                        autoSize={{ minRows: 2, maxRows: 4 }}
                        className="storyboard-textarea"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="storyboard-field">
            <label className="storyboard-field-label">继承上下文</label>
            <div className="storyboard-chips">
              {shotContext.scenes.length > 0
                ? shotContext.scenes.map((scene) => (
                    <span key={scene.id} className="storyboard-chip">
                      场次 · {scene.title}
                    </span>
                  ))
                : <span className="storyboard-chip is-empty">未连接场次</span>}
              {shotContext.characters.length > 0
                ? shotContext.characters.map((character) => (
                    <span key={character.id} className="storyboard-chip">
                      角色 · {character.name}
                    </span>
                  ))
                : <span className="storyboard-chip is-empty">未连接角色</span>}
              {shotContext.styles.length > 0
                ? shotContext.styles.map((style) => (
                    <span key={style.id} className="storyboard-chip">
                      风格 · {style.name}
                    </span>
                  ))
                : <span className="storyboard-chip is-empty">未连接风格</span>}
              {shotContext.previousShots.length > 0
                ? shotContext.previousShots.map((shot) => (
                    <span key={shot.id} className="storyboard-chip">
                      承接镜头 · {shot.title}
                    </span>
                  ))
                : <span className="storyboard-chip is-empty">未连接上游镜头</span>}
            </div>
          </div>

          <div className="storyboard-field">
            <label className="storyboard-field-label">参考资产</label>
            {shotContext.referenceAssets.length > 0 ? (
              <div className="storyboard-preview-grid">
                {shotContext.referenceAssets.map((asset, index) => (
                  <button
                    key={`${asset.url}-${asset.sourceNodeId}-${index}`}
                    type="button"
                    className="storyboard-thumb-button"
                    onClick={() =>
                      openPreview({
                        type: 'image',
                        src: asset.url,
                        title: `${asset.title} · ${asset.relation}`,
                      })
                    }
                    title={`${asset.title} · ${asset.relation}`}
                  >
                    <img src={asset.url} alt={`shot-reference-${index + 1}`} className="storyboard-thumb" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="storyboard-chip is-empty">可连接角色、上传图、上游镜头结果作为参考资产</div>
            )}
          </div>

          <div className="storyboard-note">
            <ProfileOutlined /> 最终提示词会自动融合场次、角色、风格和镜头字段后再提交到现有生成接口。
          </div>

          {needsRefresh && !isProcessing && (
            <div className="storyboard-note">上游设定或当前镜头参数已变化，建议重新生成以同步最新结果。</div>
          )}

          {(data.status === 'processing' || data.status === 'queued') && (
            <div className="storyboard-progress">
              <Progress
                percent={data.progress}
                size="small"
                status={data.status === 'queued' ? 'normal' : 'active'}
                strokeColor="#8b5e1a"
              />
            </div>
          )}

          {data.status === 'error' && data.errorMessage && (
            <div className="storyboard-error">{data.errorMessage}</div>
          )}

          {(data.outputImage || data.outputVideo) && (
            <div className="storyboard-output-card">
              {data.outputType === 'image' && data.outputImage ? (
                <img src={data.outputImage} alt={data.title || data.label} className="storyboard-output-media" />
              ) : null}
              {data.outputType === 'video' && data.outputVideo ? (
                <video src={data.outputVideo} className="storyboard-output-media" muted playsInline />
              ) : null}
              <div className="storyboard-output-meta">
                <span>{data.outputType === 'image' ? '镜头图像已生成' : '镜头视频已生成'}</span>
                <Button size="small" onClick={handlePreviewOutput} className="nodrag">
                  查看
                </Button>
              </div>
            </div>
          )}

          <Button
            type="primary"
            block
            icon={data.outputType === 'image' ? <CameraOutlined /> : <PlayCircleOutlined />}
            onClick={handleGenerate}
            loading={isProcessing || (isWorkflowExecuting && activeExecutionNodeId === id)}
            disabled={isDisabled || isBlockedByWorkflowExecution}
            className="storyboard-action-btn shot-generate-btn nodrag"
          >
            {data.status === 'queued'
              ? '排队中...'
              : isProcessing || (isWorkflowExecuting && activeExecutionNodeId === id)
                ? (data.outputType === 'image' ? '镜头出图中...' : '镜头出视频中...')
                : isBlockedByWorkflowExecution
                  ? '工作流执行中...'
                  : `${needsRefresh ? '重新生成' : '生成镜头'} · ${data.creditCost}`}
          </Button>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="storyboard-handle" />
    </div>
  )
})

ShotNode.displayName = 'ShotNode'

export default ShotNode
