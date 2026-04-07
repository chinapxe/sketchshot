import { memo, useCallback, useEffect, useRef, useState, type ChangeEvent, type CompositionEvent } from 'react'
import { Input } from 'antd'

const { TextArea } = Input

type SharedProps = {
  value: string
  onCommit: (value: string) => void
  className?: string
  placeholder?: string
  disabled?: boolean
}

type NativeTextareaProps = SharedProps & {
  variant: 'native'
  rows?: number
}

type AntdTextareaProps = SharedProps & {
  variant?: 'antd'
  autoSize?: boolean | { minRows?: number; maxRows?: number }
}

type NodeTextareaEditorProps = NativeTextareaProps | AntdTextareaProps

const NodeTextareaEditor = memo((props: NodeTextareaEditorProps) => {
  const { value, onCommit, className, placeholder, disabled } = props
  const [draftValue, setDraftValue] = useState(value)
  const isFocusedRef = useRef(false)
  const isComposingRef = useRef(false)
  const latestValueRef = useRef(value)

  useEffect(() => {
    latestValueRef.current = value

    if (!isFocusedRef.current && !isComposingRef.current) {
      setDraftValue(value)
    }
  }, [value])

  const commitDraft = useCallback((nextValue: string) => {
    if (nextValue !== latestValueRef.current) {
      onCommit(nextValue)
    }
  }, [onCommit])

  const handleChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setDraftValue(event.target.value)
  }, [])

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true
  }, [])

  const handleBlur = useCallback(() => {
    isFocusedRef.current = false

    if (!isComposingRef.current) {
      commitDraft(draftValue)
    }
  }, [commitDraft, draftValue])

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback((event: CompositionEvent<HTMLTextAreaElement>) => {
    isComposingRef.current = false
    setDraftValue(event.currentTarget.value)
  }, [])

  if (props.variant === 'native') {
    return (
      <textarea
        className={className}
        value={draftValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        placeholder={placeholder}
        disabled={disabled}
        rows={props.rows}
      />
    )
  }

  return (
    <TextArea
      value={draftValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      placeholder={placeholder}
      disabled={disabled}
      autoSize={props.autoSize}
      className={className}
    />
  )
})

NodeTextareaEditor.displayName = 'NodeTextareaEditor'

export default NodeTextareaEditor
