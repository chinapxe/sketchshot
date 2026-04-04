import { memo, useCallback, useEffect } from 'react'
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { DownOutlined, TeamOutlined, UpOutlined } from '@ant-design/icons'
import { Button, Input, Select } from 'antd'

import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { CharacterNode as CharacterNodeType } from '../../../types'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import '../storyboard.css'

const { TextArea } = Input

const CharacterNode = memo(({ id, data, selected = false }: NodeProps<CharacterNodeType>) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const toggleNodeCollapsed = useFlowStore((state) => state.toggleNodeCollapsed)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const updateNodeInternals = useUpdateNodeInternals()
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const isCollapsed = data.collapsed === true
  const referenceImages = data.referenceImages ?? []
  const threeViewImages = data.threeViewImages ?? {}
  const threeViewAssignedCount = Object.values(threeViewImages).filter(Boolean).length
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.character.width)

  useEffect(() => {
    window.requestAnimationFrame(() => updateNodeInternals(id))
  }, [id, isCollapsed, updateNodeInternals])

  const updateField = useCallback(
    (field: string, value: string) => {
      updateNodeData(id, { [field]: value })
    },
    [id, updateNodeData]
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
              placeholder="记录角色气质、习惯动作、表演关键词等"
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
