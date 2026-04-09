import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import {
  AppstoreOutlined,
  BorderOutlined,
  DownOutlined,
  HighlightOutlined,
  PictureOutlined,
  UpOutlined,
} from '@ant-design/icons'
import { Button, Progress, Select, message } from 'antd'

import {
  disconnectContinuityGeneration,
  executeContinuityNode,
} from '../../../services/continuityGeneration'
import {
  getSupportedImageAdapterValue,
  resolveVisibleImageAdapter,
  supportedImageAdapterOptions,
  type SupportedImageAdapter,
} from '../../../services/engineSettings'
import { generateContinuityFrameList, generateContinuityPrompt } from '../../../services/promptGeneration'
import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import { getContinuityContext } from '../../../utils/storyboard'
import type { ContinuityNode as ContinuityNodeType } from '../../../types'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTextareaEditor from '../shared/NodeTextareaEditor'
import NodeTitleEditor from '../shared/NodeTitleEditor'
import '../storyboard.css'

const EMPTY_FRAMES = Array.from({ length: 9 }, () => '')

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

const ContinuityNode = memo(({ id, data, selected = false }: NodeProps<ContinuityNodeType>) => {
  const [isPromptGenerating, setIsPromptGenerating] = useState(false)
  const [isFramesGenerating, setIsFramesGenerating] = useState(false)
  const [isPreviewGenerating, setIsPreviewGenerating] = useState(false)
  const [adapterValue, setAdapterValue] = useState<SupportedImageAdapter>(() => getSupportedImageAdapterValue(data.adapter))
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const toggleNodeCollapsed = useFlowStore((state) => state.toggleNodeCollapsed)
  const nodes = useFlowStore((state) => state.nodes)
  const edges = useFlowStore((state) => state.edges)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const updateNodeInternals = useUpdateNodeInternals()
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const isCollapsed = data.collapsed === true
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.continuity.width)
  const continuityContext = useMemo(() => getContinuityContext(id, nodes, edges), [edges, id, nodes])
  const referenceAssets = continuityContext.referenceAssets
  const frames = useMemo(
    () => Array.from({ length: 9 }, (_, index) => data.frames?.[index] ?? EMPTY_FRAMES[index]),
    [data.frames]
  )
  const filledFrames = useMemo(
    () =>
      frames
        .map((frame, index) => ({
          index,
          text: frame.trim(),
        }))
        .filter((item) => item.text.length > 0),
    [frames]
  )
  const hasContextInput = useMemo(
    () =>
      data.prompt.trim().length > 0
      || continuityContext.scenes.length > 0
      || continuityContext.characters.length > 0
      || continuityContext.styles.length > 0
      || referenceAssets.length > 0,
    [
      continuityContext.characters.length,
      continuityContext.scenes.length,
      continuityContext.styles.length,
      data.prompt,
      referenceAssets.length,
    ]
  )
  const isProcessing = data.status === 'processing' || data.status === 'queued'
  const needsRefresh = data.needsRefresh === true

  useEffect(() => {
    updateNodeData(id, { contextSignature: continuityContext.contextSignature })
  }, [continuityContext.contextSignature, id, updateNodeData])

  useEffect(() => {
    window.requestAnimationFrame(() => updateNodeInternals(id))
  }, [
    data.outputImage,
    data.progress,
    data.status,
    filledFrames.length,
    id,
    isCollapsed,
    referenceAssets.length,
    updateNodeInternals,
  ])

  useEffect(() => () => disconnectContinuityGeneration(id), [id])

  useEffect(() => {
    let cancelled = false

    void resolveVisibleImageAdapter(data.adapter).then((value) => {
      if (!cancelled) {
        setAdapterValue(value)
      }
    })

    return () => {
      cancelled = true
    }
  }, [data.adapter])

  const updateFrame = useCallback(
    (index: number, value: string) => {
      const nextFrames = [...frames]
      nextFrames[index] = value
      updateNodeData(id, { frames: nextFrames })
    },
    [frames, id, updateNodeData]
  )

  const handleToggleCollapsed = useCallback(() => {
    toggleNodeCollapsed(id)
  }, [id, toggleNodeCollapsed])

  const handleGeneratePrompt = useCallback(async () => {
    setIsPromptGenerating(true)
    try {
      const prompt = await generateContinuityPrompt(data, continuityContext)
      updateNodeData(id, { prompt })
      message.success('已生成九宫格总提示词')
    } catch (error) {
      console.error('[九宫格动作] 生成总提示词失败:', error)
      message.error(error instanceof Error ? error.message : '生成九宫格总提示词失败')
    } finally {
      setIsPromptGenerating(false)
    }
  }, [continuityContext, data, id, updateNodeData])

  const handleGenerateFrames = useCallback(async () => {
    if (!hasContextInput) {
      message.warning('先写总提示词，或从左侧接入参考图、角色、场次、风格信息')
      return
    }

    setIsFramesGenerating(true)
    try {
      const nextFrames = await generateContinuityFrameList(data, continuityContext)
      updateNodeData(id, { frames: nextFrames })
      message.success('已自动填写九宫格分镜')
    } catch (error) {
      console.error('[九宫格动作] 拆解九宫格失败:', error)
      message.error(error instanceof Error ? error.message : '自动拆解九宫格失败')
    } finally {
      setIsFramesGenerating(false)
    }
  }, [continuityContext, data, hasContextInput, id, updateNodeData])

  const handleGeneratePreview = useCallback(async () => {
    setIsPreviewGenerating(true)
    try {
      await executeContinuityNode(id)
    } catch (error) {
      console.error(`[continuity:${id}] preview generation failed:`, error)
    } finally {
      setIsPreviewGenerating(false)
    }
  }, [id])

  const handlePreviewReference = useCallback(
    (url: string, title: string) => {
      openPreview({ type: 'image', src: url, title })
    },
    [openPreview]
  )

  const handlePreviewOutput = useCallback(() => {
    if (!data.outputImage) return

    openPreview({
      type: 'image',
      src: data.outputImage,
      title: `${data.label} - 九宫格预览图`,
    })
  }, [data.label, data.outputImage, openPreview])

  const summaryTitle = filledFrames[0]?.text || data.prompt.trim() || '未拆解连续动作'

  return (
    <>
      <NodeWidthResizer
        nodeId={id}
        selected={selected}
        currentWidth={nodeWidth}
        minWidth={DEFAULT_NODE_SIZES.continuity.width}
      />
      <div
        className={`storyboard-node status-${data.status ?? 'idle'}${needsRefresh ? ' needs-refresh' : ''}${isDisabled ? ' node-disabled' : ''}`}
        style={{ width: nodeWidth }}
      >
        <div className="storyboard-node-header">
          <span className="storyboard-node-icon">
            <BorderOutlined />
          </span>
          <div className="storyboard-node-title-wrap">
            <NodeTitleEditor
              value={data.label}
              onChange={(value) => updateNodeData(id, { label: value })}
              className="storyboard-node-title"
              placeholder="输入节点名称"
            />
            <div className="storyboard-node-subtitle">先拆 9 格连续动作，再生成一张九宫格预览图</div>
          </div>
          <div className="storyboard-node-actions">
            {needsRefresh && !isProcessing && <span className="storyboard-badge warning">需更新</span>}
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
              <span className="storyboard-summary-label">进度</span>
              <span className="storyboard-summary-value">
                已填写 {filledFrames.length}/9 格 · 参考图 {referenceAssets.length} 张 ·
                {data.outputImage ? ' 已生成九宫格图' : ' 未出九宫格图'}
              </span>
            </div>
            <div className="storyboard-summary-tags">
              {data.prompt.trim().length > 0 && <span className="storyboard-summary-tag success">已写总提示词</span>}
              {filledFrames.length > 0 && <span className="storyboard-summary-tag">已拆 {filledFrames.length} 格</span>}
              {continuityContext.scenes.length > 0 && (
                <span className="storyboard-summary-tag">场次 {continuityContext.scenes.length}</span>
              )}
              {continuityContext.characters.length > 0 && (
                <span className="storyboard-summary-tag">角色 {continuityContext.characters.length}</span>
              )}
              {continuityContext.styles.length > 0 && (
                <span className="storyboard-summary-tag">风格 {continuityContext.styles.length}</span>
              )}
              {referenceAssets.length > 0 && (
                <span className="storyboard-summary-tag">参考图 {referenceAssets.length}</span>
              )}
              {data.outputImage && <span className="storyboard-summary-tag success">已出九宫格图</span>}
            </div>
          </div>
        ) : (
          <div className="storyboard-node-body nodrag nopan nowheel">
            <div className="storyboard-note">
              当前节点先输出 9 段连续分镜文字节拍；填写完成后，还可以继续生成一张单图九宫格预览。这样用户可以先确认
              九宫格图长什么样，再把它接给“图片预览”或“视频生成”节点继续往下走。
            </div>

            <div className="storyboard-chips">
              <span className={`storyboard-chip${referenceAssets.length === 0 ? ' is-empty' : ''}`}>
                参考图 {referenceAssets.length}
              </span>
              <span className={`storyboard-chip${continuityContext.characters.length === 0 ? ' is-empty' : ''}`}>
                角色 {continuityContext.characters.length}
              </span>
              <span className={`storyboard-chip${continuityContext.scenes.length === 0 ? ' is-empty' : ''}`}>
                场次 {continuityContext.scenes.length}
              </span>
              <span className={`storyboard-chip${continuityContext.styles.length === 0 ? ' is-empty' : ''}`}>
                风格 {continuityContext.styles.length}
              </span>
              <span className={`storyboard-chip${data.outputImage ? '' : ' is-empty'}`}>
                {data.outputImage ? '已出九宫格图' : '未出九宫格图'}
              </span>
            </div>

            <div className="storyboard-field">
              <div className="field-label-row">
                <label className="storyboard-field-label">参考图入口</label>
              </div>
              {referenceAssets.length > 0 ? (
                <div className="storyboard-reference-grid">
                  {referenceAssets.map((asset) => (
                    <button
                      key={`${asset.url}-${asset.sourceNodeId}-${asset.relation}`}
                      type="button"
                      className="storyboard-reference-card"
                      onClick={() => handlePreviewReference(asset.url, asset.title)}
                    >
                      <img src={asset.url} alt={asset.title} className="storyboard-reference-thumb" />
                      <span className="storyboard-reference-meta">
                        <span className="storyboard-reference-title">{asset.title}</span>
                        <span className="storyboard-reference-relation">{asset.relation}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="storyboard-note">
                  当前还没有接入参考图。可从左侧连接图片上传、图片生成、角色、场次或风格节点，作为九宫格动作拆解和九宫格出图的参考入口。
                </div>
              )}
            </div>

            <div className="storyboard-field">
              <div className="field-label-row">
                <label className="storyboard-field-label">九宫格总提示词</label>
                <Button
                  type="link"
                  size="small"
                  icon={<HighlightOutlined />}
                  loading={isPromptGenerating}
                  onClick={() => void handleGeneratePrompt()}
                  className="prompt-helper-btn"
                >
                  AI 润色
                </Button>
              </div>
              <NodeTextareaEditor
                value={data.prompt}
                onCommit={(value) => updateNodeData(id, { prompt: value })}
                placeholder="输入九宫格动作总提示词，例如：角色冲入走廊，减速观察，再缓慢回头，形成完整的 9 格连续分镜。"
                autoSize={{ minRows: 4, maxRows: 7 }}
                className="storyboard-textarea"
              />
              <div className="storyboard-inline-meta">
                AI 会结合当前接入的参考图、角色、场次和风格信息；当模型支持图像输入时，也会直接参考这些图片来润色总提示词。
              </div>
            </div>

            <div className="storyboard-inline-actions">
              <Button
                type="primary"
                icon={<AppstoreOutlined />}
                loading={isFramesGenerating}
                onClick={() => void handleGenerateFrames()}
                className="storyboard-action-btn"
              >
                AI 拆解九格
              </Button>
            </div>

            <div className="storyboard-nine-grid">
              {frames.map((frame, index) => (
                <div key={index} className="storyboard-nine-grid-card">
                  <div className="storyboard-nine-grid-index">{index + 1}</div>
                  <NodeTextareaEditor
                    value={frame}
                    onCommit={(value) => updateFrame(index, value)}
                    placeholder={`第 ${index + 1} 格动作`}
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    className="storyboard-textarea"
                  />
                </div>
              ))}
            </div>

            <div className="storyboard-field">
              <div className="field-label-row">
                <label className="storyboard-field-label">九宫格预览图</label>
              </div>
              <div className="storyboard-note">
                这里会生成一张单图九宫格拼图，方便先看连续动作、角色一致性和整体视觉方向。生成后的图片可以直接接到“图片预览”或“视频生成”节点。
              </div>

              <div className="storyboard-row">
                <div className="storyboard-field">
                  <label className="storyboard-field-label">预览比例</label>
                  <Select
                    size="small"
                    value={data.aspectRatio ?? '1:1'}
                    onChange={(value) => updateNodeData(id, { aspectRatio: value })}
                    options={aspectRatioOptions}
                    className="storyboard-select nodrag nopan"
                  />
                </div>
                <div className="storyboard-field">
                  <label className="storyboard-field-label">分辨率</label>
                  <Select
                    size="small"
                    value={data.resolution ?? '2K'}
                    onChange={(value) => updateNodeData(id, { resolution: value })}
                    options={resolutionOptions}
                    className="storyboard-select nodrag nopan"
                  />
                </div>
                <div className="storyboard-field">
                  <label className="storyboard-field-label">预览引擎</label>
                  <Select
                    size="small"
                    value={adapterValue}
                    onChange={(value) => updateNodeData(id, { adapter: value })}
                    options={supportedImageAdapterOptions}
                    className="storyboard-select nodrag nopan"
                  />
                </div>
              </div>

              <div className="storyboard-inline-actions">
                <Button
                  type="primary"
                  icon={<PictureOutlined />}
                  loading={isPreviewGenerating || isProcessing}
                  disabled={isDisabled}
                  onClick={() => void handleGeneratePreview()}
                  className="storyboard-action-btn"
                >
                  生成九宫格图
                </Button>
              </div>

              {isProcessing && (
                <div className="storyboard-progress">
                  <Progress percent={Math.round(data.progress ?? 0)} size="small" />
                </div>
              )}

              {data.errorMessage && data.status === 'error' && (
                <div className="storyboard-error">{data.errorMessage}</div>
              )}

              {data.outputImage ? (
                <button
                  type="button"
                  className="storyboard-preview-card"
                  onClick={handlePreviewOutput}
                >
                  <img src={data.outputImage} alt="九宫格预览图" className="storyboard-preview-image" />
                  <span className="storyboard-preview-caption">点击查看大图</span>
                </button>
              ) : (
                <div className="storyboard-chip is-empty">
                  暂无九宫格预览图，先拆九格动作后再生成会更稳定。
                </div>
              )}
            </div>
          </div>
        )}

        <Handle type="target" position={Position.Left} className="storyboard-handle handle-kind-hybrid" />
        <Handle type="source" position={Position.Right} className="storyboard-handle handle-kind-hybrid" />
      </div>
    </>
  )
})

ContinuityNode.displayName = 'ContinuityNode'

export default ContinuityNode
