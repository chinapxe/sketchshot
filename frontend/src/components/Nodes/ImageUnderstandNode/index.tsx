/**
 * 图片理解节点 — 分析图片并生成场景描述提示词。
 */
import { memo, useCallback } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { PictureOutlined, ThunderboltOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons'
import { Button, message } from 'antd'

import { executeImageUnderstandNode, executeUnderstandPromptNode } from '../../../services/imageUnderstand'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { ImageUnderstandNode as ImageUnderstandNodeType } from '../../../types'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTitleEditor from '../shared/NodeTitleEditor'
import { useState } from 'react'
import './style.css'

const ImageUnderstandNode = memo(({ id, data, selected = false }: NodeProps<ImageUnderstandNodeType>) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.imageUnderstand.width)
  const [copied, setCopied] = useState(false)

  const isDisabled = (data as Record<string, unknown>).disabled === true
  const isGenerating = data.isGenerating === true
  const isGeneratingPrompt = data.isGeneratingPrompt === true
  const hasImage = Boolean(data.imageUrl)
  const hasDescription = Boolean(data.description)
  const hasPrompt = Boolean(data.generatedPrompt)

  const handleGenerate = useCallback(async () => {
    try {
      await executeImageUnderstandNode(id)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '生成失败')
    }
  }, [id])

  const handleGeneratePrompt = useCallback(async () => {
    try {
      await executeUnderstandPromptNode(id)
    } catch (error) {
      message.error(error instanceof Error ? error.message : '提示词生成失败')
    }
  }, [id])

  const handleCopyPrompt = useCallback(async () => {
    if (!data.generatedPrompt) return
    try {
      await navigator.clipboard.writeText(data.generatedPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      message.success('已复制到剪贴板')
    } catch {
      message.error('复制失败')
    }
  }, [data.generatedPrompt])

  const handlePromptChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { generatedPrompt: event.target.value })
    },
    [id, updateNodeData]
  )

  return (
    <>
      <NodeWidthResizer
        nodeId={id}
        selected={selected}
        currentWidth={nodeWidth}
        minWidth={DEFAULT_NODE_SIZES.imageUnderstand.width}
      />
      <div
        className={`image-understand-node${selected ? ' selected' : ''}${isDisabled ? ' node-disabled' : ''}`}
        style={{ width: nodeWidth }}
      >
        <div className="node-header">
          <PictureOutlined className="node-icon" />
          <NodeTitleEditor
            value={data.label}
            onChange={(value) => updateNodeData(id, { label: value })}
            className="node-title"
            placeholder="输入节点名称"
          />
          {isDisabled && <span className="node-disabled-badge">已禁用</span>}
          {isGenerating && <span className="node-processing-badge">分析中...</span>}
          {isGeneratingPrompt && <span className="node-processing-badge">生成提示词中...</span>}
        </div>

        <div className="node-body nodrag nopan nowheel">
          {/* Image preview */}
          <div className="understand-image-section">
            {data.imageUrl ? (
              <img src={data.imageUrl} alt="输入图片" className="understand-preview" />
            ) : (
              <div className="understand-image-placeholder">
                <PictureOutlined className="placeholder-icon" />
                <span>连接图片输入</span>
              </div>
            )}
          </div>

          {/* Generate Description button */}
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={handleGenerate}
            loading={isGenerating}
            disabled={!hasImage || isDisabled || isGenerating}
            block
            size="small"
            className="understand-generate-btn"
          >
            {isGenerating ? '分析中...' : '生成描述'}
          </Button>

          {/* Generate Prompt button (requires description first) */}
          <Button
            icon={<CopyOutlined />}
            onClick={handleGeneratePrompt}
            loading={isGeneratingPrompt}
            disabled={!hasDescription || isDisabled || isGeneratingPrompt}
            block
            size="small"
          >
            {isGeneratingPrompt ? '生成中...' : '生成提示词'}
          </Button>

          {/* Error message */}
          {data.errorMessage && (
            <div className="understand-error">{data.errorMessage}</div>
          )}

          {/* Scene understanding (read-only) */}
          {hasDescription && (
            <div className="understand-description-section">
              <div className="understand-section-header">
                <span className="understand-section-label">场景理解</span>
              </div>
              <div className="understand-description-content">{data.description}</div>
            </div>
          )}

          {/* Generated prompt (editable) */}
          {hasPrompt && (
            <div className="understand-prompt-section">
              <div className="understand-prompt-header">
                <span className="understand-prompt-label">推荐提示词</span>
                <Button
                  type="text"
                  size="small"
                  icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                  onClick={handleCopyPrompt}
                  className="understand-copy-btn"
                >
                  {copied ? '已复制' : '复制'}
                </Button>
              </div>
              <textarea
                className="understand-prompt-textarea nodrag"
                value={data.generatedPrompt}
                onChange={handlePromptChange}
                rows={4}
                placeholder="AI 生成的提示词将显示在这里..."
              />
            </div>
          )}
        </div>

        <Handle type="target" position={Position.Left} className="node-handle handle-kind-image" />
        <Handle type="source" position={Position.Right} className="node-handle handle-kind-context" />
      </div>
    </>
  )
})

ImageUnderstandNode.displayName = 'ImageUnderstandNode'

export default ImageUnderstandNode
