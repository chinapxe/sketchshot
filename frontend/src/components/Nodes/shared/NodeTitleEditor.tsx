import { memo, useCallback, useEffect, useState } from 'react'
import { EditOutlined } from '@ant-design/icons'
import { Input } from 'antd'

import './nodeTitleEditor.css'

interface NodeTitleEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}

const NodeTitleEditor = memo(({ value, onChange, className, placeholder }: NodeTitleEditorProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [draftValue, setDraftValue] = useState(value)

  useEffect(() => {
    if (!isEditing) {
      setDraftValue(value)
    }
  }, [isEditing, value])

  const handleStartEditing = useCallback((event?: React.MouseEvent<HTMLElement>) => {
    event?.stopPropagation()
    setDraftValue(value)
    setIsEditing(true)
  }, [value])

  const handleCancelEditing = useCallback(() => {
    setDraftValue(value)
    setIsEditing(false)
  }, [value])

  const handleCommitEditing = useCallback(() => {
    const nextValue = draftValue.trim() || value

    if (nextValue !== value) {
      onChange(nextValue)
    }

    setIsEditing(false)
  }, [draftValue, onChange, value])

  const handleTriggerMouseDown = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }, [])

  const handleInputMouseDown = useCallback((event: React.MouseEvent<HTMLInputElement>) => {
    event.stopPropagation()
  }, [])

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      handleCancelEditing()
    }
  }, [handleCancelEditing])

  return (
    <div className={`node-title-editor${className ? ` ${className}` : ''}`}>
      {isEditing ? (
        <Input
          size="small"
          autoFocus
          value={draftValue}
          placeholder={placeholder}
          className="node-title-editor-input nodrag nopan"
          onChange={(event) => setDraftValue(event.target.value)}
          onBlur={handleCommitEditing}
          onPressEnter={handleCommitEditing}
          onKeyDown={handleKeyDown}
          onMouseDown={handleInputMouseDown}
        />
      ) : (
        <>
          <span
            className="node-title-editor-text"
            title="双击可改名"
            onDoubleClick={handleStartEditing}
          >
            {value}
          </span>
          <button
            type="button"
            className="node-title-editor-trigger nodrag nopan"
            onClick={handleStartEditing}
            onMouseDown={handleTriggerMouseDown}
            aria-label="重命名节点"
            title="重命名节点"
          >
            <EditOutlined />
          </button>
        </>
      )}
    </div>
  )
})

NodeTitleEditor.displayName = 'NodeTitleEditor'

export default NodeTitleEditor
