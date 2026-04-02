import { memo, useCallback, useEffect } from 'react'
import { Handle, Position, useUpdateNodeInternals, type NodeProps } from '@xyflow/react'
import { BranchesOutlined, DownOutlined, UpOutlined } from '@ant-design/icons'
import { Button, Input } from 'antd'

import { useFlowStore } from '../../../stores/useFlowStore'
import type { SceneNode as SceneNodeType } from '../../../types'
import '../storyboard.css'

const { TextArea } = Input

const SceneNode = memo(({ id, data }: NodeProps<SceneNodeType>) => {
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

  const summaryTitle = data.title.trim() || '未填写场次标题'
  const summarySynopsis = data.synopsis.trim() || '折叠后会在这里显示场次概述，方便画布快速浏览。'
  const summaryBeat = data.beat.trim() || '尚未填写情节推进点'

  return (
    <div className={`storyboard-node${isDisabled ? ' node-disabled' : ''}`}>
      <div className="storyboard-node-header">
        <span className="storyboard-node-icon">
          <BranchesOutlined />
        </span>
        <div className="storyboard-node-title-wrap">
          <div className="storyboard-node-title">{data.label}</div>
          <div className="storyboard-node-subtitle">组织同一场次下的镜头与叙事目标</div>
        </div>
        <div className="storyboard-node-actions">
          {isDisabled && <span className="storyboard-badge disabled">Disabled</span>}
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
        <div className="storyboard-node-body storyboard-node-body-collapsed">
          <div className="storyboard-summary-title">{summaryTitle}</div>
          <div className="storyboard-summary-item">
            <span className="storyboard-summary-label">概述</span>
            <span className="storyboard-summary-value">{summarySynopsis}</span>
          </div>
          <div className="storyboard-summary-item">
            <span className="storyboard-summary-label">推进</span>
            <span className="storyboard-summary-value">{summaryBeat}</span>
          </div>
          <div className="storyboard-summary-tags">
            <span className="storyboard-summary-tag">{data.notes.trim() ? '已写备注' : '待补备注'}</span>
          </div>
        </div>
      ) : (
        <div className="storyboard-node-body">
          <div className="storyboard-field">
            <label className="storyboard-field-label">场次标题</label>
            <Input
              value={data.title}
              onChange={(event) => updateField('title', event.target.value)}
              placeholder="例如：雨夜屋顶对峙"
              className="storyboard-input"
            />
          </div>

          <div className="storyboard-field">
            <label className="storyboard-field-label">场次概述</label>
            <TextArea
              value={data.synopsis}
              onChange={(event) => updateField('synopsis', event.target.value)}
              placeholder="描述这一场戏发生了什么，以及它在故事中的作用"
              autoSize={{ minRows: 3, maxRows: 6 }}
              className="storyboard-textarea"
            />
          </div>

          <div className="storyboard-field">
            <label className="storyboard-field-label">情节推进点</label>
            <TextArea
              value={data.beat}
              onChange={(event) => updateField('beat', event.target.value)}
              placeholder="例如：主角确认真相，关系彻底破裂"
              autoSize={{ minRows: 2, maxRows: 4 }}
              className="storyboard-textarea"
            />
          </div>

          <div className="storyboard-field">
            <label className="storyboard-field-label">备注</label>
            <TextArea
              value={data.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              placeholder="补充节奏、对白气质或场景调度要求"
              autoSize={{ minRows: 2, maxRows: 4 }}
              className="storyboard-textarea"
            />
          </div>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="storyboard-handle" />
    </div>
  )
})

SceneNode.displayName = 'SceneNode'

export default SceneNode
