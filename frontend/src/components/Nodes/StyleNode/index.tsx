import { memo, useCallback } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { BgColorsOutlined } from '@ant-design/icons'
import { Input } from 'antd'

import { useFlowStore } from '../../../stores/useFlowStore'
import type { StyleNode as StyleNodeType } from '../../../types'
import '../storyboard.css'

const { TextArea } = Input

const StyleNode = memo(({ id, data }: NodeProps<StyleNodeType>) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const isDisabled = (data as Record<string, unknown>).disabled === true

  const updateField = useCallback(
    (field: string, value: string) => {
      updateNodeData(id, { [field]: value })
    },
    [id, updateNodeData]
  )

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
        {isDisabled && <span className="storyboard-badge disabled">Disabled</span>}
      </div>

      <div className="storyboard-node-body">
        <div className="storyboard-field">
          <label className="storyboard-field-label">风格名称</label>
          <Input
            value={data.name}
            onChange={(event) => updateField('name', event.target.value)}
            placeholder="例如：冷峻写实悬疑"
            className="storyboard-input"
          />
        </div>

        <div className="storyboard-field">
          <label className="storyboard-field-label">关键词</label>
          <TextArea
            value={data.keywords}
            onChange={(event) => updateField('keywords', event.target.value)}
            placeholder="例如：胶片颗粒、雨夜霓虹、低饱和、高反差"
            autoSize={{ minRows: 2, maxRows: 4 }}
            className="storyboard-textarea"
          />
        </div>

        <div className="storyboard-row">
          <div className="storyboard-field">
            <label className="storyboard-field-label">色彩氛围</label>
            <Input
              value={data.palette}
              onChange={(event) => updateField('palette', event.target.value)}
              placeholder="例如：冷青灰、局部暖橙"
              className="storyboard-input"
            />
          </div>
          <div className="storyboard-field">
            <label className="storyboard-field-label">光线方向</label>
            <Input
              value={data.lighting}
              onChange={(event) => updateField('lighting', event.target.value)}
              placeholder="例如：侧逆光、局部硬光"
              className="storyboard-input"
            />
          </div>
        </div>

        <div className="storyboard-field">
          <label className="storyboard-field-label">镜头语言</label>
          <Input
            value={data.framing}
            onChange={(event) => updateField('framing', event.target.value)}
            placeholder="例如：对称构图、压迫式留白、人物偏边缘"
            className="storyboard-input"
          />
        </div>

        <div className="storyboard-field">
          <label className="storyboard-field-label">备注</label>
          <TextArea
            value={data.notes}
            onChange={(event) => updateField('notes', event.target.value)}
            placeholder="补充风格禁忌、材质质感、参考导演语言等"
            autoSize={{ minRows: 2, maxRows: 4 }}
            className="storyboard-textarea"
          />
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="storyboard-handle" />
    </div>
  )
})

StyleNode.displayName = 'StyleNode'

export default StyleNode
