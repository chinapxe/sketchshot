import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { DownOutlined, TeamOutlined, UpOutlined } from '@ant-design/icons'
import { Button, Input, Select } from 'antd'

import {
  CHARACTER_STATE_OPTIONS,
  CHARACTER_TEMPERAMENT_OPTIONS,
} from '../../../config/storyboardPresets'
import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { CharacterNode as CharacterNodeType } from '../../../types'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import '../storyboard.css'

const { TextArea } = Input

type CharacterPresetTabKey = 'temperamentTags' | 'stateTags'
type CharacterPresetSummaryItem = {
  id: string
  text: string
  key: CharacterPresetTabKey
  value: string
}

const characterPresetTabs: Array<{
  key: CharacterPresetTabKey
  label: string
  options: typeof CHARACTER_TEMPERAMENT_OPTIONS
}> = [
  { key: 'temperamentTags', label: '气质', options: CHARACTER_TEMPERAMENT_OPTIONS },
  { key: 'stateTags', label: '状态', options: CHARACTER_STATE_OPTIONS },
]

function buildCharacterPresetSummary(data: CharacterNodeType['data']): CharacterPresetSummaryItem[] {
  return [
    ...((data.temperamentTags ?? []).map((value) => ({
      id: `temperamentTags:${value}`,
      text: `气质 · ${value}`,
      key: 'temperamentTags' as const,
      value,
    }))),
    ...((data.stateTags ?? []).map((value) => ({
      id: `stateTags:${value}`,
      text: `状态 · ${value}`,
      key: 'stateTags' as const,
      value,
    }))),
  ]
}

const CharacterNode = memo(({ id, data, selected = false }: NodeProps<CharacterNodeType>) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const toggleNodeCollapsed = useFlowStore((state) => state.toggleNodeCollapsed)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const updateNodeInternals = useUpdateNodeInternals()
  const [isPresetPanelOpen, setIsPresetPanelOpen] = useState(false)
  const [activePresetTab, setActivePresetTab] = useState<CharacterPresetTabKey>('temperamentTags')
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const isCollapsed = data.collapsed === true
  const referenceImages = data.referenceImages ?? []
  const threeViewImages = data.threeViewImages ?? {}
  const threeViewAssignedCount = Object.values(threeViewImages).filter(Boolean).length
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.character.width)
  const presetSummary = useMemo(() => buildCharacterPresetSummary(data), [data])
  const activeTabConfig = useMemo(
    () => characterPresetTabs.find((tab) => tab.key === activePresetTab) ?? characterPresetTabs[0],
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
    (field: CharacterPresetTabKey, value: string) => {
      const currentValues = ((data[field] as string[] | undefined) ?? []).filter((item) => item.trim().length > 0)
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value]

      updateNodeData(id, { [field]: nextValues })
    },
    [data, id, updateNodeData]
  )

  const handleRemovePresetSummaryItem = useCallback(
    (item: CharacterPresetSummaryItem) => {
      const currentValues = ((data[item.key] as string[] | undefined) ?? []).filter((value) => value.trim().length > 0)
      updateNodeData(id, {
        [item.key]: currentValues.filter((value) => value !== item.value),
      })
    },
    [data, id, updateNodeData]
  )

  const updateThreeView = useCallback(
    (slot: 'front' | 'side' | 'back', value?: string) => {
      updateNodeData(id, {
        threeViewImages: {
          ...threeViewImages,
          [slot]: value,
        },
      })
    },
    [id, threeViewImages, updateNodeData]
  )

  const handleToggleCollapsed = useCallback(() => {
    toggleNodeCollapsed(id)
  }, [id, toggleNodeCollapsed])

  const handleTogglePresetPanel = useCallback(() => {
    setIsPresetPanelOpen((current) => !current)
  }, [])

  const referenceOptions = referenceImages.map((imageUrl, index) => ({
    value: imageUrl,
    label: `参考图 ${index + 1}`,
  }))

  const summaryName = data.name.trim() || '未填写角色名'
  const summaryRole = data.role.trim() || '未填写角色定位'
  const summaryAppearance = data.appearance.trim() || '未填写外观描述'

  return (
    <>
      <NodeWidthResizer
        nodeId={id}
        selected={selected}
        currentWidth={nodeWidth}
        minWidth={DEFAULT_NODE_SIZES.character.width}
      />
      <div className={`storyboard-node${isDisabled ? ' node-disabled' : ''}`} style={{ width: nodeWidth }}>
        <Handle type="target" position={Position.Left} className="storyboard-handle" />

        <div className="storyboard-node-header">
          <span className="storyboard-node-icon">
            <TeamOutlined />
          </span>
          <div className="storyboard-node-title-wrap">
            <div className="storyboard-node-title">{data.label}</div>
            <div className="storyboard-node-subtitle">统一角色设定与参考形象</div>
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
              <span className="storyboard-summary-label">定位</span>
              <span className="storyboard-summary-value">{summaryRole}</span>
            </div>
            <div className="storyboard-summary-item">
              <span className="storyboard-summary-label">外观</span>
              <span className="storyboard-summary-value">{summaryAppearance}</span>
            </div>
            <div className="storyboard-summary-tags">
              {presetSummary.length > 0 ? (
                <>
                  {presetSummary.slice(0, 2).map((item) => (
                    <span key={item.id} className="storyboard-summary-tag">
                      {item.text}
                    </span>
                  ))}
                  {presetSummary.length > 2 && (
                    <span className="storyboard-summary-tag">+{presetSummary.length - 2}</span>
                  )}
                </>
              ) : (
                <span className="storyboard-summary-tag">未选角色标签</span>
              )}
              <span className="storyboard-summary-tag">参考图 {referenceImages.length}</span>
              <span className="storyboard-summary-tag">三视图 {threeViewAssignedCount}/3</span>
              <span className="storyboard-summary-tag">
                {data.wardrobe.trim() || data.props.trim() ? '已补服装/道具' : '待补服装/道具'}
              </span>
            </div>
          </div>
        ) : (
          <div className="storyboard-node-body nodrag nopan nowheel">
            <div className="storyboard-row">
              <div className="storyboard-field">
                <label className="storyboard-field-label">角色名</label>
                <Input
                  value={data.name}
                  onChange={(event) => updateField('name', event.target.value)}
                  placeholder="例如：沈迟"
                  className="storyboard-input nodrag"
                />
              </div>
              <div className="storyboard-field">
                <label className="storyboard-field-label">角色定位</label>
                <Input
                  value={data.role}
                  onChange={(event) => updateField('role', event.target.value)}
                  placeholder="例如：落魄调查记者"
                  className="storyboard-input nodrag"
                />
              </div>
            </div>

            <div className="storyboard-field">
              <label className="storyboard-field-label">外观描述</label>
              <TextArea
                value={data.appearance}
                onChange={(event) => updateField('appearance', event.target.value)}
                placeholder="描述年龄感、五官、体态、发型等稳定特征"
                autoSize={{ minRows: 3, maxRows: 6 }}
                className="storyboard-textarea nodrag"
              />
            </div>

            <div className="storyboard-field">
              <div className="field-label-row">
                <label className="storyboard-field-label">角色标签</label>
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
                  <span className="storyboard-chip is-empty">未选择标签，可直接手写下方备注</span>
                )}
              </div>
              {isPresetPanelOpen && (
                <div className="storyboard-preset-panel">
                  <div className="storyboard-preset-toolbar">
                    {characterPresetTabs.map((tab) => (
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

            <div className="storyboard-note">
              这组轻标签用于稳定角色气质和当前状态，适合和外观描述搭配使用，不必选满。
            </div>

            <div className="storyboard-row">
              <div className="storyboard-field">
                <label className="storyboard-field-label">服装</label>
                <Input
                  value={data.wardrobe}
                  onChange={(event) => updateField('wardrobe', event.target.value)}
                  placeholder="例如：深色风衣、旧皮靴"
                  className="storyboard-input nodrag"
                />
              </div>
              <div className="storyboard-field">
                <label className="storyboard-field-label">道具</label>
                <Input
                  value={data.props}
                  onChange={(event) => updateField('props', event.target.value)}
                  placeholder="例如：录音笔、旧相机"
                  className="storyboard-input nodrag"
                />
              </div>
            </div>

            <div className="storyboard-field">
              <label className="storyboard-field-label">补充备注</label>
              <TextArea
                value={data.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                placeholder="记录习惯动作、表演提示、禁忌项或其他稳定要求"
                autoSize={{ minRows: 2, maxRows: 4 }}
                className="storyboard-textarea nodrag"
              />
            </div>

            <div className="storyboard-field">
              <label className="storyboard-field-label">参考形象</label>
              {referenceImages.length > 0 ? (
                <div className="storyboard-preview-grid">
                  {referenceImages.map((imageUrl, index) => (
                    <button
                      key={`${imageUrl}-${index}`}
                      type="button"
                      className="storyboard-thumb-button nodrag"
                      onClick={() =>
                        openPreview({
                          type: 'image',
                          src: imageUrl,
                          title: `${data.name || data.label} - 参考图 ${index + 1}`,
                        })
                      }
                    >
                      <img src={imageUrl} alt={`参考图-${index + 1}`} className="storyboard-thumb" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="storyboard-chip is-empty">连接上传图或上游图像结果后，会自动沉淀到角色设定中</div>
              )}
            </div>

            <div className="storyboard-field">
              <label className="storyboard-field-label">人物三视图</label>
              {referenceImages.length > 0 ? (
                <div className="storyboard-three-view-grid">
                  {([
                    { key: 'front', label: '正面' },
                    { key: 'side', label: '侧面' },
                    { key: 'back', label: '背面' },
                  ] as const).map((slot) => {
                    const imageUrl = threeViewImages[slot.key]

                    return (
                      <div key={slot.key} className="storyboard-three-view-card">
                        <div className="storyboard-three-view-label">{slot.label}</div>
                        {imageUrl ? (
                          <button
                            type="button"
                            className="storyboard-thumb-button nodrag"
                            onClick={() =>
                              openPreview({
                                type: 'image',
                                src: imageUrl,
                                title: `${data.name || data.label} - ${slot.label}`,
                              })
                            }
                          >
                            <img src={imageUrl} alt={`${slot.label}-参考图`} className="storyboard-thumb" />
                          </button>
                        ) : (
                          <div className="storyboard-chip is-empty">未指定</div>
                        )}
                        <Select
                          allowClear
                          size="small"
                          value={imageUrl}
                          options={referenceOptions}
                          onChange={(value) => updateThreeView(slot.key, value)}
                          placeholder={`选择${slot.label}参考`}
                          className="storyboard-select nodrag nopan"
                        />
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="storyboard-chip is-empty">先沉淀参考图后，系统会自动填充正面、侧面、背面槽位</div>
              )}
            </div>
          </div>
        )}

        <Handle type="source" position={Position.Right} className="storyboard-handle" />
      </div>
    </>
  )
})

CharacterNode.displayName = 'CharacterNode'

export default CharacterNode
