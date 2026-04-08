import { memo, useCallback, useEffect, useMemo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AppstoreOutlined, PictureOutlined, SyncOutlined } from '@ant-design/icons'
import { Button, Progress, Select } from 'antd'

import {
  disconnectThreeViewGeneration,
  executeThreeViewGenNode,
} from '../../../services/threeViewGeneration'
import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { ThreeViewGenNode as ThreeViewGenNodeType } from '../../../types'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import {
  THREE_VIEW_ALL_HANDLE_ID,
  THREE_VIEW_SLOT_KEYS,
  THREE_VIEW_SLOT_HANDLE_IDS,
  THREE_VIEW_SLOT_LABELS,
  countThreeViewImages,
  getThreeViewOutputEntries,
  getThreeViewOutputMode,
} from '../../../utils/threeView'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTextareaEditor from '../shared/NodeTextareaEditor'
import NodeTitleEditor from '../shared/NodeTitleEditor'
import '../storyboard.css'

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

const outputModeOptions = [
  { value: 'sheet', label: '拼板单图' },
  { value: 'split', label: '三张独立图' },
]

const splitOutputHandleConfigs = [
  { id: THREE_VIEW_ALL_HANDLE_ID, label: '全部输出', top: '18%' },
  ...THREE_VIEW_SLOT_KEYS.map((slot, index) => ({
    id: THREE_VIEW_SLOT_HANDLE_IDS[slot],
    label: `${THREE_VIEW_SLOT_LABELS[slot]}输出`,
    top: ['42%', '58%', '74%'][index],
  })),
]

const defaultOutputHandleConfig = [{ id: THREE_VIEW_ALL_HANDLE_ID, label: '输出结果', top: '50%' }]

const ThreeViewGenNode = memo(({ id, data, selected = false }: NodeProps<ThreeViewGenNodeType>) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const getUpstreamImages = useFlowStore((state) => state.getUpstreamImages)
  const edges = useFlowStore((state) => state.edges)
  const isWorkflowExecuting = useFlowStore((state) => state.isWorkflowExecuting)
  const activeExecutionNodeId = useFlowStore((state) => state.activeExecutionNodeId)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.threeViewGen.width)
  const isProcessing = data.status === 'processing' || data.status === 'queued'
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const needsRefresh = data.needsRefresh === true
  const isBlockedByWorkflowExecution = isWorkflowExecuting && activeExecutionNodeId !== id
  const referenceImages = data.referenceImages ?? []
  const outputMode = getThreeViewOutputMode(data)
  const outputEntries = useMemo(() => getThreeViewOutputEntries(data), [data])
  const generatedCount = countThreeViewImages(data.outputImages)
  const outputHandles = outputMode === 'split' ? splitOutputHandleConfigs : defaultOutputHandleConfig

  useEffect(() => {
    updateNodeData(id, { referenceImages: getUpstreamImages(id) })
  }, [edges, getUpstreamImages, id, updateNodeData])

  useEffect(() => () => disconnectThreeViewGeneration(id), [id])

  const handleGenerate = useCallback(async () => {
    try {
      await executeThreeViewGenNode(id)
    } catch (error) {
      console.error(`[three-view:${id}] execute failed:`, error)
    }
  }, [id])

  const handlePreviewReference = useCallback(
    (imageUrl: string, index: number) => {
      openPreview({
        type: 'image',
        src: imageUrl,
        title: `${data.label} - 参考图 ${index + 1}`,
      })
    },
    [data.label, openPreview]
  )

  const handlePreviewOutput = useCallback(
    (imageUrl: string, label: string) => {
      openPreview({
        type: 'image',
        src: imageUrl,
        title: `${data.label} - ${label}`,
      })
    },
    [data.label, openPreview]
  )

  return (
    <>
      <NodeWidthResizer
        nodeId={id}
        selected={selected}
        currentWidth={nodeWidth}
        minWidth={DEFAULT_NODE_SIZES.threeViewGen.width}
      />
      <div
        className={`storyboard-node status-${data.status}${needsRefresh ? ' needs-refresh' : ''}${isDisabled ? ' node-disabled' : ''}`}
        style={{ width: nodeWidth }}
      >
        <Handle type="target" position={Position.Left} className="storyboard-handle handle-kind-image" />

        <div className="storyboard-node-header">
          <span className="storyboard-node-icon">
            <AppstoreOutlined />
          </span>
          <div className="storyboard-node-title-wrap">
            <NodeTitleEditor
              value={data.label}
              onChange={(value) => updateNodeData(id, { label: value })}
              className="storyboard-node-title"
              placeholder="输入节点名称"
            />
            <div className="storyboard-node-subtitle">根据参考图生成角色三视图，可输出拼板或拆分图</div>
          </div>
          <div className="storyboard-node-actions">
            {needsRefresh && !isProcessing && (
              <span className="storyboard-badge warning">
                <SyncOutlined /> 需更新
              </span>
            )}
            {isDisabled && <span className="storyboard-badge disabled">已禁用</span>}
          </div>
        </div>

        <div className="storyboard-node-body nodrag nopan nowheel">
          <div className="storyboard-note">
            `拼板单图` 适合角色设定板预览，`三张独立图` 适合继续流转到图片展示、角色节点或下游生成节点。
          </div>

          {outputMode === 'split' && (
            <div className="storyboard-note">拆分模式右侧输出口从上到下依次为：全部、正面、侧面、背面。</div>
          )}

          <div className="storyboard-chips">
            <span className={`storyboard-chip${referenceImages.length === 0 ? ' is-empty' : ''}`}>
              参考图 {referenceImages.length}
            </span>
            <span className="storyboard-chip">
              {outputMode === 'sheet' ? '模式: 拼板单图' : '模式: 三张独立图'}
            </span>
            <span className={`storyboard-chip${outputEntries.length === 0 ? ' is-empty' : ''}`}>
              {outputMode === 'sheet'
                ? (data.outputImage ? '已生成拼板图' : '未生成拼板图')
                : `已生成 ${generatedCount}/3 张`}
            </span>
          </div>

          <div className="storyboard-field">
            <label className="storyboard-field-label">参考图</label>
            {referenceImages.length > 0 ? (
              <div className="storyboard-preview-grid">
                {referenceImages.map((imageUrl, index) => (
                  <button
                    key={`${imageUrl}-${index}`}
                    type="button"
                    className="storyboard-thumb-button nodrag"
                    onClick={() => handlePreviewReference(imageUrl, index)}
                  >
                    <img src={imageUrl} alt={`参考图-${index + 1}`} className="storyboard-thumb" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="storyboard-chip is-empty">请从左侧连接上传图或图片生成结果</div>
            )}
          </div>

          <div className="storyboard-field">
            <label className="storyboard-field-label">补充要求</label>
            <NodeTextareaEditor
              value={data.prompt}
              onCommit={(value) => updateNodeData(id, { prompt: value })}
              placeholder="可补充体态、服装一致性、视角要求或设定板风格，例如：全身、中立站姿、服装细节清晰"
              autoSize={{ minRows: 3, maxRows: 6 }}
              className="storyboard-textarea"
            />
          </div>

          <div className="storyboard-row">
            <div className="storyboard-field">
              <label className="storyboard-field-label">输出模式</label>
              <Select
                size="small"
                value={outputMode}
                onChange={(value) => updateNodeData(id, { outputMode: value })}
                options={outputModeOptions}
                className="storyboard-select nodrag nopan"
              />
            </div>
            <div className="storyboard-field">
              <label className="storyboard-field-label">画面比例</label>
              <Select
                size="small"
                value={data.aspectRatio}
                onChange={(value) => updateNodeData(id, { aspectRatio: value })}
                options={aspectRatioOptions}
                className="storyboard-select nodrag nopan"
              />
            </div>
            <div className="storyboard-field">
              <label className="storyboard-field-label">分辨率</label>
              <Select
                size="small"
                value={data.resolution}
                onChange={(value) => updateNodeData(id, { resolution: value })}
                options={resolutionOptions}
                className="storyboard-select nodrag nopan"
              />
            </div>
          </div>

          {needsRefresh && !isProcessing && (
            <div className="storyboard-note">
              上游参考图、输出模式或当前参数已变化，建议重新生成三视图，保持角色设定同步。
            </div>
          )}

          {(data.status === 'processing' || data.status === 'queued') && (
            <div className="storyboard-progress">
              <Progress
                percent={data.progress}
                size="small"
                status={data.status === 'queued' ? 'normal' : 'active'}
              />
            </div>
          )}

          {data.status === 'error' && data.errorMessage && (
            <div className="storyboard-error">{data.errorMessage}</div>
          )}

          <div className="storyboard-inline-actions">
            <Button
              type="primary"
              icon={<PictureOutlined />}
              loading={isProcessing || (isWorkflowExecuting && activeExecutionNodeId === id)}
              disabled={isDisabled || isBlockedByWorkflowExecution}
              onClick={() => void handleGenerate()}
              className="storyboard-action-btn"
            >
              {data.status === 'queued'
                ? '排队中...'
                : isProcessing || (isWorkflowExecuting && activeExecutionNodeId === id)
                  ? '生成中...'
                  : isBlockedByWorkflowExecution
                    ? '工作流执行中'
                    : needsRefresh ? '重新生成三视图' : '生成三视图'}
            </Button>
          </div>

          <div className="storyboard-field">
            <label className="storyboard-field-label">输出结果</label>
            {outputMode === 'sheet' ? (
              data.outputImage ? (
                <button
                  type="button"
                  className="storyboard-preview-card"
                  onClick={() => handlePreviewOutput(data.outputImage!, '三视图拼板')}
                >
                  <img src={data.outputImage} alt="三视图拼板" className="storyboard-preview-image" />
                  <span className="storyboard-preview-caption">点击查看大图</span>
                </button>
              ) : (
                <div className="storyboard-chip is-empty">生成后会在这里显示三视图拼板图</div>
              )
            ) : outputEntries.length > 0 ? (
              <div className="storyboard-three-view-grid">
                {[
                  { key: 'front', label: '正面' },
                  { key: 'side', label: '侧面' },
                  { key: 'back', label: '背面' },
                ].map((slot) => {
                  const entry = outputEntries.find((item) => item.key === slot.key)

                  return (
                    <div key={slot.key} className="storyboard-three-view-card">
                      <div className="storyboard-three-view-label">{slot.label}</div>
                      {entry ? (
                        <button
                          type="button"
                          className="storyboard-thumb-button nodrag"
                          onClick={() => handlePreviewOutput(entry.url, entry.label)}
                        >
                          <img src={entry.url} alt={slot.label} className="storyboard-thumb" />
                        </button>
                      ) : (
                        <div className="storyboard-chip is-empty">未生成</div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="storyboard-chip is-empty">生成后会在这里显示正面、侧面、背面三张独立图</div>
            )}
          </div>
        </div>

        {outputHandles.map((handle) => (
          <Handle
            key={handle.id}
            id={handle.id}
            type="source"
            position={Position.Right}
            className="storyboard-handle handle-kind-image"
            style={{ top: handle.top }}
            title={handle.label}
            aria-label={`${data.label}-${handle.label}`}
          />
        ))}
      </div>
    </>
  )
})

ThreeViewGenNode.displayName = 'ThreeViewGenNode'

export default ThreeViewGenNode
