import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Handle, Position, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import {
  AimOutlined,
  CameraOutlined,
  DownOutlined,
  HighlightOutlined,
  PlayCircleOutlined,
  ProfileOutlined,
  SyncOutlined,
  UpOutlined,
} from '@ant-design/icons'
import { Button, Input, InputNumber, Progress, Select, Slider, message } from 'antd'

import {
  CAMERA_ANGLE_OPTIONS,
  SHOT_CAMERA_MOVEMENT_OPTIONS,
  SHOT_COMPOSITION_OPTIONS,
  SHOT_LIGHTING_OPTIONS,
  SHOT_MOOD_OPTIONS,
  SHOT_QUALITY_OPTIONS,
  SHOT_SIZE_OPTIONS,
  getOptionLabel,
} from '../../../config/storyboardPresets'
import { generateShotPrompt } from '../../../services/promptGeneration'
import { disconnectShotGeneration, executeShotNode } from '../../../services/storyboardGeneration'
import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import { getShotContext, resolveShotContinuityFrames } from '../../../utils/storyboard'
import type { AppNode, ShotNode as ShotNodeType } from '../../../types'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTextareaEditor from '../shared/NodeTextareaEditor'
import NodeTitleEditor from '../shared/NodeTitleEditor'
import '../storyboard.css'

type ShotPresetTabKey =
  | 'shotSize'
  | 'cameraAngle'
  | 'cameraMovement'
  | 'composition'
  | 'lightingStyle'
  | 'moodTags'
  | 'qualityTags'

type ShotPresetSelectionMode = 'single' | 'toggle' | 'multi'
type ShotPresetSummaryItem = {
  id: string
  text: string
  key: ShotPresetTabKey
  value?: string
  removable: boolean
  resetValue?: string
}

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

const shotPresetTabs: Array<{
  key: ShotPresetTabKey
  label: string
  mode: ShotPresetSelectionMode
  options: ReadonlyArray<{ value: string; label: string }>
}> = [
  { key: 'shotSize', label: '景别', mode: 'single', options: SHOT_SIZE_OPTIONS },
  { key: 'cameraAngle', label: '机位', mode: 'single', options: CAMERA_ANGLE_OPTIONS },
  { key: 'cameraMovement', label: '运镜', mode: 'toggle', options: SHOT_CAMERA_MOVEMENT_OPTIONS },
  { key: 'composition', label: '构图', mode: 'toggle', options: SHOT_COMPOSITION_OPTIONS },
  { key: 'lightingStyle', label: '光线', mode: 'toggle', options: SHOT_LIGHTING_OPTIONS },
  { key: 'moodTags', label: '氛围', mode: 'multi', options: SHOT_MOOD_OPTIONS },
  { key: 'qualityTags', label: '质感', mode: 'multi', options: SHOT_QUALITY_OPTIONS },
]

function resolveShotSizeValue(value: ShotNodeType['data']['shotSize']): string {
  return value === 'establishing' ? 'extreme-wide' : value
}

function resolveShotSizeLabel(value: ShotNodeType['data']['shotSize']): string {
  return getOptionLabel(SHOT_SIZE_OPTIONS, resolveShotSizeValue(value)) || '中景'
}

function resolveCameraAngleLabel(value: ShotNodeType['data']['cameraAngle']): string {
  return getOptionLabel(CAMERA_ANGLE_OPTIONS, value) || '平视'
}

function buildShotPresetSummary(data: ShotNodeType['data']): ShotPresetSummaryItem[] {
  const moodValues = Array.from(new Set((data.moodTags ?? []).filter((value) => value.trim().length > 0)))
  const qualityValues = Array.from(new Set((data.qualityTags ?? []).filter((value) => value.trim().length > 0)))

  return [
    {
      id: `shotSize:${resolveShotSizeValue(data.shotSize)}`,
      text: `景别 · ${resolveShotSizeLabel(data.shotSize)}`,
      key: 'shotSize',
      value: resolveShotSizeValue(data.shotSize),
      removable: data.shotSize !== 'medium',
      resetValue: 'medium',
    },
    {
      id: `cameraAngle:${data.cameraAngle}`,
      text: `机位 · ${resolveCameraAngleLabel(data.cameraAngle)}`,
      key: 'cameraAngle',
      value: data.cameraAngle,
      removable: data.cameraAngle !== 'eye-level',
      resetValue: 'eye-level',
    },
    ...(data.cameraMovement
      ? [
          {
            id: `cameraMovement:${data.cameraMovement}`,
            text: `运镜 · ${getOptionLabel(SHOT_CAMERA_MOVEMENT_OPTIONS, data.cameraMovement)}`,
            key: 'cameraMovement',
            value: data.cameraMovement,
            removable: true,
          } satisfies ShotPresetSummaryItem,
        ]
      : []),
    ...(data.composition
      ? [
          {
            id: `composition:${data.composition}`,
            text: `构图 · ${getOptionLabel(SHOT_COMPOSITION_OPTIONS, data.composition)}`,
            key: 'composition',
            value: data.composition,
            removable: true,
          } satisfies ShotPresetSummaryItem,
        ]
      : []),
    ...(data.lightingStyle
      ? [
          {
            id: `lightingStyle:${data.lightingStyle}`,
            text: `光线 · ${getOptionLabel(SHOT_LIGHTING_OPTIONS, data.lightingStyle)}`,
            key: 'lightingStyle',
            value: data.lightingStyle,
            removable: true,
          } satisfies ShotPresetSummaryItem,
        ]
      : []),
    ...moodValues.map(
      (value) =>
        ({
          id: `moodTags:${value}`,
          text: `氛围 · ${getOptionLabel(SHOT_MOOD_OPTIONS, value)}`,
          key: 'moodTags',
          value,
          removable: true,
        }) satisfies ShotPresetSummaryItem
    ),
    ...qualityValues.map(
      (value) =>
        ({
          id: `qualityTags:${value}`,
          text: `质感 · ${getOptionLabel(SHOT_QUALITY_OPTIONS, value)}`,
          key: 'qualityTags',
          value,
          removable: true,
        }) satisfies ShotPresetSummaryItem
    ),
  ]
}

function getActivePresetValues(data: ShotNodeType['data'], key: ShotPresetTabKey): string[] {
  switch (key) {
    case 'shotSize':
      return [resolveShotSizeValue(data.shotSize)]
    case 'cameraAngle':
      return [data.cameraAngle]
    case 'cameraMovement':
      return data.cameraMovement ? [data.cameraMovement] : []
    case 'composition':
      return data.composition ? [data.composition] : []
    case 'lightingStyle':
      return data.lightingStyle ? [data.lightingStyle] : []
    case 'moodTags':
      return data.moodTags ?? []
    case 'qualityTags':
      return data.qualityTags ?? []
    default:
      return []
  }
}

const ShotNode = memo(({ id, data, selected = false }: NodeProps<ShotNodeType>) => {
  const nodeRef = useRef<HTMLDivElement>(null)
  const [isPromptGenerating, setIsPromptGenerating] = useState(false)
  const [isPresetPanelOpen, setIsPresetPanelOpen] = useState(false)
  const [activePresetTab, setActivePresetTab] = useState<ShotPresetTabKey>('shotSize')
  const { fitView } = useReactFlow<AppNode>()
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const toggleNodeCollapsed = useFlowStore((state) => state.toggleNodeCollapsed)
  const selectNode = useFlowStore((state) => state.selectNode)
  const nodes = useFlowStore((state) => state.nodes)
  const edges = useFlowStore((state) => state.edges)
  const isWorkflowExecuting = useFlowStore((state) => state.isWorkflowExecuting)
  const activeExecutionNodeId = useFlowStore((state) => state.activeExecutionNodeId)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const updateNodeInternals = useUpdateNodeInternals()
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.shot.width)

  const shotContext = useMemo(() => getShotContext(id, nodes, edges), [edges, id, nodes])
  const referenceAssetOptions = useMemo(
    () =>
      shotContext.referenceAssets.map((asset) => ({
        value: asset.url,
        label: `${asset.title} · ${asset.relation}`,
      })),
    [shotContext.referenceAssets]
  )
  const activeTabConfig = useMemo(
    () => shotPresetTabs.find((tab) => tab.key === activePresetTab) ?? shotPresetTabs[0],
    [activePresetTab]
  )
  const activePresetValues = useMemo(
    () => getActivePresetValues(data, activeTabConfig.key),
    [activeTabConfig.key, data]
  )
  const presetSummary = useMemo(() => buildShotPresetSummary(data), [data])
  const isCollapsed = data.collapsed === true
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const isProcessing = data.status === 'processing' || data.status === 'queued'
  const isBlockedByWorkflowExecution = isWorkflowExecuting && activeExecutionNodeId !== id
  const needsRefresh = data.needsRefresh === true
  const shotSizeLabel = resolveShotSizeLabel(data.shotSize)
  const cameraAngleLabel = resolveCameraAngleLabel(data.cameraAngle)
  const resolvedContinuityFrames = useMemo(() => resolveShotContinuityFrames(data, shotContext), [data, shotContext])
  const filledContinuityCount = resolvedContinuityFrames.filter((value) => value.trim().length > 0).length
  const outputTypeLabel = data.outputType === 'video' ? '视频' : '图像'
  const hasOutput = data.outputType === 'video' ? Boolean(data.outputVideo) : Boolean(data.outputImage)

  useEffect(() => {
    window.requestAnimationFrame(() => updateNodeInternals(id))
  }, [id, isCollapsed, isPresetPanelOpen, updateNodeInternals])

  useEffect(() => () => disconnectShotGeneration(id), [id])

  const blurButtonIfFocused = useCallback((selector: string) => {
    const root = nodeRef.current
    const activeElement = document.activeElement
    if (!root || !(activeElement instanceof HTMLElement)) return
    const button = root.querySelector<HTMLElement>(selector)
    if (button && activeElement === button) button.blur()
  }, [])

  useEffect(() => {
    if (!isProcessing && (!isWorkflowExecuting || activeExecutionNodeId !== id)) {
      blurButtonIfFocused('.shot-generate-btn')
    }
  }, [activeExecutionNodeId, blurButtonIfFocused, id, isProcessing, isWorkflowExecuting])

  useEffect(() => {
    if (!isPromptGenerating) blurButtonIfFocused('.shot-prompt-helper-btn')
  }, [blurButtonIfFocused, isPromptGenerating])

  const updateField = useCallback(
    (field: string, value: string | number | boolean | undefined) => updateNodeData(id, { [field]: value }),
    [id, updateNodeData]
  )

  const setSinglePresetField = useCallback(
    (field: 'shotSize' | 'cameraAngle' | 'cameraMovement' | 'composition' | 'lightingStyle', value: string) => {
      if (field === 'shotSize' || field === 'cameraAngle') {
        updateNodeData(id, { [field]: value })
        return
      }
      const currentValue = (data[field] as string | undefined) ?? ''
      updateNodeData(id, { [field]: currentValue === value ? '' : value })
    },
    [data, id, updateNodeData]
  )

  const toggleMultiPresetField = useCallback(
    (field: 'moodTags' | 'qualityTags', value: string) => {
      const currentValues = ((data[field] as string[] | undefined) ?? []).filter((item) => item.trim().length > 0)
      const nextValues = currentValues.includes(value) ? currentValues.filter((item) => item !== value) : [...currentValues, value]
      updateNodeData(id, { [field]: nextValues })
    },
    [data, id, updateNodeData]
  )

  const handleSelectPresetOption = useCallback(
    (value: string) => {
      switch (activeTabConfig.key) {
        case 'shotSize':
        case 'cameraAngle':
        case 'cameraMovement':
        case 'composition':
        case 'lightingStyle':
          setSinglePresetField(activeTabConfig.key, value)
          return
        case 'moodTags':
        case 'qualityTags':
          toggleMultiPresetField(activeTabConfig.key, value)
      }
    },
    [activeTabConfig.key, setSinglePresetField, toggleMultiPresetField]
  )

  const handleRemovePresetSummaryItem = useCallback(
    (item: ShotPresetSummaryItem) => {
      switch (item.key) {
        case 'shotSize':
        case 'cameraAngle':
          if (item.resetValue) {
            updateNodeData(id, { [item.key]: item.resetValue })
          }
          return
        case 'cameraMovement':
        case 'composition':
        case 'lightingStyle':
          updateNodeData(id, { [item.key]: '' })
          return
        case 'moodTags':
        case 'qualityTags': {
          const currentValues = ((data[item.key] as string[] | undefined) ?? []).filter(
            (value) => value.trim().length > 0
          )
          updateNodeData(id, {
            [item.key]: currentValues.filter((value) => value !== item.value),
          })
        }
      }
    },
    [data, id, updateNodeData]
  )

  const handleToggleCollapsed = useCallback(() => toggleNodeCollapsed(id), [id, toggleNodeCollapsed])
  const handleTogglePresetPanel = useCallback(() => setIsPresetPanelOpen((current) => !current), [])
  const handleLocateContinuityNode = useCallback(() => {
    const continuityId = shotContext.continuity?.id
    if (!continuityId) return

    const continuityNode = nodes.find((node) => node.id === continuityId)
    if (!continuityNode) {
      message.warning('未找到已连接的九宫格动作节点')
      return
    }

    selectNode(continuityId)
    void fitView({
      nodes: [continuityNode],
      padding: 0.28,
      duration: 280,
      maxZoom: 1.15,
    })
  }, [fitView, nodes, selectNode, shotContext.continuity])

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
      if (!latestNode || latestNode.type !== 'shot') throw new Error('镜头节点不存在')
      const latestContext = getShotContext(id, latestNodes, latestEdges)
      const generatedPrompt = await generateShotPrompt(latestNode.data, latestContext)
      updateNodeData(id, { prompt: generatedPrompt })
      message.success('镜头提示已润色')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '镜头提示润色失败')
    } finally {
      setIsPromptGenerating(false)
    }
  }, [id, updateNodeData])

  const handlePreviewOutput = useCallback(() => {
    if (data.outputType === 'video' && data.outputVideo) {
      openPreview({ type: 'video', src: data.outputVideo, title: data.title || data.label })
      return
    }
    if (data.outputType === 'image' && data.outputImage) {
      openPreview({ type: 'image', src: data.outputImage, title: data.title || data.label })
    }
  }, [data.label, data.outputImage, data.outputType, data.outputVideo, data.title, openPreview])

  const summaryTitle = data.title.trim() || '未填写镜头标题'
  const summaryDescription = data.description.trim() || '未填写镜头描述'

  const collapsedContent = (
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
        {presetSummary.slice(0, 4).map((item) => (
          <span key={item.id} className="storyboard-summary-tag">
            {item.text}
          </span>
        ))}
        {presetSummary.length > 4 && <span className="storyboard-summary-tag">+{presetSummary.length - 4}</span>}
        <span className="storyboard-summary-tag">{data.motion.trim() || '待写动作'}</span>
        <span className="storyboard-summary-tag">{data.emotion.trim() || '待写情绪'}</span>
        <span className="storyboard-summary-tag">参考素材 {shotContext.referenceAssets.length}</span>
        <span className="storyboard-summary-tag">承接上游 {shotContext.previousShots.length}</span>
        {data.outputType === 'video' && (
          <span className="storyboard-summary-tag">
            {shotContext.continuity ? '九宫格节点' : '九宫格'} {filledContinuityCount}/9
          </span>
        )}
        {data.videoFirstFrame && <span className="storyboard-summary-tag">有首帧</span>}
        {data.videoLastFrame && <span className="storyboard-summary-tag">有尾帧</span>}
        {data.prompt.trim() && <span className="storyboard-summary-tag">已补导演提示</span>}
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

      {data.status === 'error' && data.errorMessage && <div className="storyboard-error">{data.errorMessage}</div>}

      {hasOutput && (
        <div className="storyboard-summary-actions">
          <Button size="small" onClick={handlePreviewOutput} className="nodrag">
            预览结果
          </Button>
        </div>
      )}
    </div>
  )
  const presetPanelContent = isPresetPanelOpen ? (
    <div className="storyboard-preset-panel">
      <div className="storyboard-preset-toolbar">
        {shotPresetTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`storyboard-preset-segment${activePresetTab === tab.key ? ' is-active' : ''}`}
            onClick={() => setActivePresetTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="storyboard-option-grid">
        {activeTabConfig.options.map((option) => {
          const isActive = activePresetValues.includes(option.value)

          return (
            <button
              key={option.value}
              type="button"
              className={`storyboard-option-chip${isActive ? ' is-active' : ''}`}
              onClick={() => handleSelectPresetOption(option.value)}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  ) : null
  const outputSettingsContent = data.outputType === 'image' ? (
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
    </div>
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
        只设置一张约束图时，会按单图视频方式起步或收束；同时设置首帧和尾帧时，会按首尾约束生成更完整的镜头运动。
        {shotContext.previousShots.length > 0
          ? ` 当前已承接上游镜头 ${shotContext.previousShots.map((shot) => shot.title).join(' / ')}。`
          : ''}
      </div>

      <div className="storyboard-field">
        <label className="storyboard-field-label">九宫格连续动作</label>
        <div className="storyboard-note">
          建议把九宫格拆到独立的“九宫格动作”节点里维护。镜头节点这里只显示摘要，并继续兼容旧项目里保存在镜头上的九宫格数据。
        </div>
        <div className="storyboard-preset-summary">
          {filledContinuityCount > 0 ? (
            resolvedContinuityFrames
              .map((frame, index) => ({
                index,
                text: frame.trim(),
              }))
              .filter((item) => item.text.length > 0)
              .slice(0, 4)
              .map((item) => (
                <span key={item.index} className="storyboard-chip">
                  {item.index + 1}. {item.text}
                </span>
              ))
          ) : (
            <span className="storyboard-chip is-empty">未连接九宫格动作节点，也没有旧九宫格数据</span>
          )}
          {filledContinuityCount > 4 && <span className="storyboard-chip">+{filledContinuityCount - 4}</span>}
        </div>
        <div className={`storyboard-inline-meta${shotContext.continuity ? ' storyboard-inline-meta-row' : ''}`}>
          <span className="storyboard-inline-meta-text">
            {shotContext.continuity
              ? `当前读取：${shotContext.continuity.label}${shotContext.continuityCount > 1 ? `（已连接 ${shotContext.continuityCount} 个，按首个读取）` : ''}`
              : filledContinuityCount > 0
                ? '当前读取：镜头节点里保留的旧九宫格数据'
                : '当前读取：无'}
          </span>
          {shotContext.continuity && (
            <Button
              type="link"
              size="small"
              icon={<AimOutlined />}
              onClick={handleLocateContinuityNode}
              className="storyboard-inline-action nodrag"
            >
              定位节点
            </Button>
          )}
        </div>
      </div>
    </>
  )
  const contextContent = (
    <>
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
          <div className="storyboard-chip is-empty">可连接角色设定、图片上传或上游镜头结果，系统会自动汇总到这里</div>
        )}
      </div>
    </>
  )
  const outputPreviewContent = (data.outputImage || data.outputVideo) ? (
    <div className="storyboard-output-card">
      {data.outputType === 'image' && data.outputImage ? (
        <img src={data.outputImage} alt={data.title || data.label} className="storyboard-output-media" />
      ) : null}
      {data.outputType === 'video' && data.outputVideo ? (
        <video src={data.outputVideo} className="storyboard-output-media" muted playsInline />
      ) : null}
      <div className="storyboard-output-meta">
        <span>{data.outputType === 'image' ? '镜头图像已就绪' : '镜头视频已就绪'}</span>
        <Button size="small" onClick={handlePreviewOutput} className="nodrag">
          预览结果
        </Button>
      </div>
    </div>
  ) : null
  const expandedContent = (
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
        <NodeTextareaEditor
          value={data.description}
          onCommit={(value) => updateField('description', value)}
          placeholder="描述这个镜头真正要表现的画面与行为"
          autoSize={{ minRows: 3, maxRows: 6 }}
          className="storyboard-textarea"
        />
      </div>

      <div className="storyboard-field">
        <div className="field-label-row">
          <label className="storyboard-field-label">导演补充</label>
          <Button
            type="text"
            size="small"
            icon={<HighlightOutlined />}
            onClick={handleGeneratePrompt}
            loading={isPromptGenerating}
            disabled={isPromptGenerating || isProcessing || isDisabled || isBlockedByWorkflowExecution}
            className="prompt-helper-btn shot-prompt-helper-btn nodrag"
          >
            AI 润色
          </Button>
        </div>
        <NodeTextareaEditor
          value={data.prompt}
          onCommit={(value) => updateField('prompt', value)}
          placeholder="补充道具、镜头调度、环境细节、氛围词等"
          autoSize={{ minRows: 2, maxRows: 4 }}
          className="storyboard-textarea"
        />
      </div>

      <div className="storyboard-field">
        <div className="field-label-row">
          <label className="storyboard-field-label">镜头预设</label>
          <Button
            type="text"
            size="small"
            onClick={handleTogglePresetPanel}
            className="storyboard-preset-toggle nodrag"
          >
            {isPresetPanelOpen ? '收起面板' : '展开面板'}
          </Button>
        </div>
        <div className="storyboard-preset-summary">
          {presetSummary.map((item) =>
            item.removable ? (
              <button
                key={item.id}
                type="button"
                className="storyboard-chip storyboard-chip-button is-removable nodrag"
                onClick={() => handleRemovePresetSummaryItem(item)}
                title={`移除${item.text}`}
              >
                <span>{item.text}</span>
                <span className="storyboard-chip-remove" aria-hidden="true">
                  ×
                </span>
              </button>
            ) : (
              <span key={item.id} className="storyboard-chip">
                {item.text}
              </span>
            )
          )}
        </div>
        {presetPanelContent}
      </div>

      <div className="storyboard-note">预设负责快速定镜头语言，动作、情绪和导演补充继续写更具体的表演与调度。</div>

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

      {outputSettingsContent}
      {contextContent}

      <div className="storyboard-note">
        <ProfileOutlined /> 提交生成前，系统会自动把场次、角色、风格和镜头信息合成为最终提示词。
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

      {data.status === 'error' && data.errorMessage && <div className="storyboard-error">{data.errorMessage}</div>}
      {outputPreviewContent}

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
            ? (data.outputType === 'image' ? '镜头出图中...' : '镜头视频生成中...')
            : isBlockedByWorkflowExecution
              ? '工作流执行中，请稍候'
              : needsRefresh ? '重新生成镜头' : '开始生成镜头'}
      </Button>
    </div>
  )

  return (
    <>
      <NodeWidthResizer
        nodeId={id}
        selected={selected}
        currentWidth={nodeWidth}
        minWidth={DEFAULT_NODE_SIZES.shot.width}
      />
      <div
        ref={nodeRef}
        className={`storyboard-node status-${data.status}${needsRefresh ? ' needs-refresh' : ''}${isDisabled ? ' node-disabled' : ''}`}
        style={{ width: nodeWidth }}
      >
        <Handle type="target" position={Position.Left} className="storyboard-handle handle-kind-hybrid" />

        <div className="storyboard-node-header">
          <span className="storyboard-node-icon">
            <CameraOutlined />
          </span>
          <div className="storyboard-node-title-wrap">
            <NodeTitleEditor
              value={data.label}
              onChange={(value) => updateNodeData(id, { label: value })}
              className="storyboard-node-title"
              placeholder="输入节点名称"
            />
            <div className="storyboard-node-subtitle">把场次、角色和风格整理成可直接生成的镜头语言</div>
          </div>
          <div className="storyboard-node-actions">
            {needsRefresh && !isProcessing && (
              <span className="storyboard-badge refresh">
                <SyncOutlined />
                需更新
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

        {isCollapsed ? collapsedContent : expandedContent}

        <Handle
          type="source"
          position={Position.Right}
          className={`storyboard-handle ${data.outputType === 'video' ? 'handle-kind-video' : 'handle-kind-image'}`}
        />
      </div>
    </>
  )
})

ShotNode.displayName = 'ShotNode'

export default ShotNode
