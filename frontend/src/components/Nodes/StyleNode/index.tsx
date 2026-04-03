import { memo, useCallback, useEffect } from 'react'
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { BgColorsOutlined, DownOutlined, UpOutlined } from '@ant-design/icons'
import { Button, Input } from 'antd'

import { useFlowStore } from '../../../stores/useFlowStore'
import type { StyleNode as StyleNodeType } from '../../../types'
import '../storyboard.css'

const { TextArea } = Input

const StyleNode = memo(({ id, data }: NodeProps<StyleNodeType>) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const toggleNodeCollapsed = useFlowStore((state) => state.toggleNodeCollapsed)
  const updateNodeInternals = useUpdateNodeInternals()
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const isCollapsed = data.collapsed === true

  useEffect(() => {
    window.requestAnimationFrame(() => updateNodeInternals(id))
  }, [id, isCollapsed, updateNodeInternals])

  const updateField = useCallback(
    (field: string, value: string) => {
      updateNodeData(id, { [field]: value })
    },
    [id, updateNodeData]
  )

  const handleToggleCollapsed = useCallback(() => {
    toggleNodeCollapsed(id)
  }, [id, toggleNodeCollapsed])

  const summaryName = data.name.trim() || '未填写风格名称'
  const summaryKeywords = data.keywords.trim() || '未填写风格关键词'

  return (
    <div className={`storyboard-node${isDisabled ? ' node-disabled' : ''}`}>
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
            <span className="storyboard-summary-tag">{data.palette.trim() || '待补色彩'}</span>
            <span className="storyboard-summary-tag">{data.lighting.trim() || '待补光线'}</span>
            <span className="storyboard-summary-tag">{data.framing.trim() ? '已写镜头语言' : '待写镜头语言'}</span>
          </div>
        </div>
      ) : (
        <div className="storyboard-node-body nodrag nopan nowheel">
          <div className="storyboard-field">
            <label className="storyboard-field-label">风格名称</label>
            <Input
              value={data.name}
              onChange={(event) => updateField('name', event.target.value)}
              placeholder="例如：冷峻写实悬疑"
              className="storyboard-input nodrag"
            />
          </div>

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
  )
})

StyleNode.displayName = 'StyleNode'

export default StyleNode
