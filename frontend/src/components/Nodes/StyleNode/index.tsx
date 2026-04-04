import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { BgColorsOutlined, DownOutlined, UpOutlined } from '@ant-design/icons'
import { Button, Input } from 'antd'

import {
  STYLE_FRAMING_OPTIONS,
  STYLE_LIGHTING_OPTIONS,
  STYLE_PALETTE_OPTIONS,
  STYLE_QUALITY_OPTIONS,
  STYLE_TAG_OPTIONS,
} from '../../../config/storyboardPresets'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { StyleNode as StyleNodeType } from '../../../types'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import '../storyboard.css'

const { TextArea } = Input

type StylePresetTabKey = 'styleTags' | 'paletteTags' | 'lightingTags' | 'framingTags' | 'qualityTags'
type StylePresetSummaryItem = {
  id: string
  text: string
  key: StylePresetTabKey
  value: string
}

const stylePresetTabs: Array<{
  key: StylePresetTabKey
  label: string
  options: typeof STYLE_TAG_OPTIONS
}> = [
  { key: 'styleTags', label: '风格', options: STYLE_TAG_OPTIONS },
  { key: 'paletteTags', label: '色彩', options: STYLE_PALETTE_OPTIONS },
  { key: 'lightingTags', label: '光线', options: STYLE_LIGHTING_OPTIONS },
  { key: 'framingTags', label: '构图', options: STYLE_FRAMING_OPTIONS },
  { key: 'qualityTags', label: '质感', options: STYLE_QUALITY_OPTIONS },
]

function buildStylePresetSummary(data: StyleNodeType['data']): StylePresetSummaryItem[] {
  return [
    ...((data.styleTags ?? []).map((value) => ({
      id: `styleTags:${value}`,
      text: `风格 · ${value}`,
      key: 'styleTags' as const,
      value,
    }))),
    ...((data.paletteTags ?? []).map((value) => ({
      id: `paletteTags:${value}`,
      text: `色彩 · ${value}`,
      key: 'paletteTags' as const,
      value,
    }))),
    ...((data.lightingTags ?? []).map((value) => ({
      id: `lightingTags:${value}`,
      text: `光线 · ${value}`,
      key: 'lightingTags' as const,
      value,
    }))),
    ...((data.framingTags ?? []).map((value) => ({
      id: `framingTags:${value}`,
      text: `构图 · ${value}`,
      key: 'framingTags' as const,
      value,
    }))),
    ...((data.qualityTags ?? []).map((value) => ({
      id: `qualityTags:${value}`,
      text: `质感 · ${value}`,
      key: 'qualityTags' as const,
      value,
    }))),
  ]
}

const StyleNode = memo(({ id, data, selected = false }: NodeProps<StyleNodeType>) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const toggleNodeCollapsed = useFlowStore((state) => state.toggleNodeCollapsed)
  const updateNodeInternals = useUpdateNodeInternals()
  const [isPresetPanelOpen, setIsPresetPanelOpen] = useState(false)
  const [activePresetTab, setActivePresetTab] = useState<StylePresetTabKey>('styleTags')
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const isCollapsed = data.collapsed === true
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.style.width)
  const presetSummary = useMemo(() => buildStylePresetSummary(data), [data])
  const activeTabConfig = useMemo(
    () => stylePresetTabs.find((tab) => tab.key === activePresetTab) ?? stylePresetTabs[0],
    [activePresetTab]
  )
  const activeValues = useMemo(
    () => ((data[activeTabConfig.key] as string[] | undefined) ?? []),
    [activeTabConfig.key, data]
  )

  useEffect(() => {
    window.requestAnimationFrame(() => updateNodeInternals(id))
  }, [id, isCollapsed, isPresetPanelOpen, updateNodeInternals])

  const updateField = useCallback(
    (field: string, value: string) => {
      updateNodeData(id, { [field]: value })
    },
    [id, updateNodeData]
  )

  const togglePresetValue = useCallback(
    (field: StylePresetTabKey, value: string) => {
      const currentValues = ((data[field] as string[] | undefined) ?? []).filter((item) => item.trim().length > 0)
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value]

      updateNodeData(id, { [field]: nextValues })
    },
    [data, id, updateNodeData]
  )

  const handleRemovePresetSummaryItem = useCallback(
    (item: StylePresetSummaryItem) => {
      const currentValues = ((data[item.key] as string[] | undefined) ?? []).filter((value) => value.trim().length > 0)
      updateNodeData(id, {
        [item.key]: currentValues.filter((value) => value !== item.value),
      })
    },
    [data, id, updateNodeData]
  )

  const handleToggleCollapsed = useCallback(() => {
    toggleNodeCollapsed(id)
  }, [id, toggleNodeCollapsed])

  const handleTogglePresetPanel = useCallback(() => {
    setIsPresetPanelOpen((current) => !current)
  }, [])

  const summaryName = data.name.trim() || '未填写风格名称'
  const summaryKeywords =
    data.keywords.trim() || presetSummary.slice(0, 3).map((item) => item.text).join(' / ') || '未填写风格关键词'

  return (
    <>
      <NodeWidthResizer
        nodeId={id}
        selected={selected}
        currentWidth={nodeWidth}
        minWidth={DEFAULT_NODE_SIZES.style.width}
      />
      <div className={`storyboard-node${isDisabled ? ' node-disabled' : ''}`} style={{ width: nodeWidth }}>
        <div className="storyboard-node-header">
          <span className="storyboard-node-icon">
            <BgColorsOutlined />
          </span>
          <div className="storyboard-node-title-wrap">
            <div className="storyboard-node-title">{data.label}</div>
            <div className="storyboard-node-subtitle">统一视觉气质、构图和光影语言</div>
          </div>
          <div className="storyboard-node-actions">
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
            <div className="storyboard-summary-title">{summaryName}</div>
            <div className="storyboard-summary-item">
              <span className="storyboard-summary-label">关键词</span>
              <span className="storyboard-summary-value">{summaryKeywords}</span>
            </div>
            <div className="storyboard-summary-tags">
              {presetSummary.length > 0 ? (
                <>
                  {presetSummary.slice(0, 4).map((item) => (
                    <span key={item.id} className="storyboard-summary-tag">
                      {item.text}
                    </span>
                  ))}
                  {presetSummary.length > 4 && (
                    <span className="storyboard-summary-tag">+{presetSummary.length - 4}</span>
                  )}
                </>
              ) : (
                <span className="storyboard-summary-tag">未选预设</span>
              )}
              <span className="storyboard-summary-tag">{data.palette.trim() || '待补色彩'}</span>
              <span className="storyboard-summary-tag">{data.lighting.trim() || '待补光线'}</span>
              <span className="storyboard-summary-tag">
                {data.framing.trim() ? '已写镜头语言' : '待写镜头语言'}
              </span>
            </div>
          </div>
        ) : (
          <div className="storyboard-node-body nodrag nopan nowheel">
            <div className="storyboard-field">
              <label className="storyboard-field-label">风格名称</label>
              <Input
                value={data.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="例如：冷峻都市悬疑"
                className="storyboard-input nodrag"
              />
            </div>

            <div className="storyboard-field">
              <div className="field-label-row">
                <label className="storyboard-field-label">风格预设</label>
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
                {presetSummary.length > 0 ? (
                  presetSummary.map((item) => (
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
                  ))
                ) : (
                  <span className="storyboard-chip is-empty">未选择预设，可直接手写下方文本</span>
                )}
              </div>
              {isPresetPanelOpen && (
                <div className="storyboard-preset-panel">
                  <div className="storyboard-preset-toolbar">
                    {stylePresetTabs.map((tab) => (
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
                      const isActive = activeValues.includes(option.value)

                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`storyboard-option-chip${isActive ? ' is-active' : ''}`}
                          onClick={() => togglePresetValue(activeTabConfig.key, option.value)}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="storyboard-note">预设负责快速定方向，下方文本负责补充更细的导演语言和禁忌项。</div>

            <div className="storyboard-field">
              <label className="storyboard-field-label">关键词</label>
              <TextArea
                value={data.keywords}
                onChange={(event) => updateField('keywords', event.target.value)}
                placeholder="例如：胶片颗粒、雨夜霓虹、低饱和、高反差"
                autoSize={{ minRows: 2, maxRows: 4 }}
                className="storyboard-textarea nodrag"
              />
            </div>

            <div className="storyboard-row">
              <div className="storyboard-field">
                <label className="storyboard-field-label">色彩氛围</label>
                <Input
                  value={data.palette}
                  onChange={(event) => updateField('palette', event.target.value)}
                  placeholder="例如：冷青灰、局部暖橙"
                  className="storyboard-input nodrag"
                />
              </div>
              <div className="storyboard-field">
                <label className="storyboard-field-label">光线方向</label>
                <Input
                  value={data.lighting}
                  onChange={(event) => updateField('lighting', event.target.value)}
                  placeholder="例如：侧逆光、局部硬光"
                  className="storyboard-input nodrag"
                />
              </div>
            </div>

            <div className="storyboard-field">
              <label className="storyboard-field-label">镜头语言</label>
              <Input
                value={data.framing}
                onChange={(event) => updateField('framing', event.target.value)}
                placeholder="例如：对称构图、压迫式留白、人物偏边缘"
                className="storyboard-input nodrag"
              />
            </div>

            <div className="storyboard-field">
              <label className="storyboard-field-label">备注</label>
              <TextArea
                value={data.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                placeholder="补充风格禁忌、材质质感、参考导演语言等"
                autoSize={{ minRows: 2, maxRows: 4 }}
                className="storyboard-textarea nodrag"
              />
            </div>
          </div>
        )}

        <Handle type="source" position={Position.Right} className="storyboard-handle" />
      </div>
    </>
  )
})

StyleNode.displayName = 'StyleNode'

export default StyleNode
