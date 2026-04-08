/**
 * 图片生成节点。
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import {
  CloseOutlined,
  HighlightOutlined,
  LoadingOutlined,
  PictureOutlined,
  PlusOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { Button, Progress, Select, message } from 'antd'

import {
  IMAGE_QUICK_PROMPT_CHIPS,
  IMAGE_QUICK_TEMPLATES,
  appendPromptFragment,
  appendPromptLine,
} from '../../../config/generationQuickPresets'
import { uploadImageAsset, type UploadedAssetResponse } from '../../../services/api'
import { disconnectNodeGeneration, executeImageGenNode } from '../../../services/nodeGeneration'
import { generateImagePrompt } from '../../../services/promptGeneration'
import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { ImageGenNode as ImageGenNodeType, ImageGenNodeData } from '../../../types'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTextareaEditor from '../shared/NodeTextareaEditor'
import NodeTitleEditor from '../shared/NodeTitleEditor'
import './style.css'

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

const ImageGenNode = memo(({ id, data, selected = false }: NodeProps<ImageGenNodeType>) => {
  const nodeRef = useRef<HTMLDivElement>(null)
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const getUpstreamImages = useFlowStore((state) => state.getUpstreamImages)
  const edges = useFlowStore((state) => state.edges)
  const isWorkflowExecuting = useFlowStore((state) => state.isWorkflowExecuting)
  const activeExecutionNodeId = useFlowStore((state) => state.activeExecutionNodeId)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPromptGenerating, setIsPromptGenerating] = useState(false)
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.imageGen.width)

  useEffect(() => {
    const upstreamImages = getUpstreamImages(id)
    updateNodeData(id, { upstreamReferenceImages: upstreamImages })
  }, [edges, id, getUpstreamImages, updateNodeData])

  useEffect(() => () => disconnectNodeGeneration(id), [id])

  const blurButtonIfFocused = useCallback((selector: string) => {
    const root = nodeRef.current
    const activeElement = document.activeElement

    if (!root || !(activeElement instanceof HTMLElement)) return

    const button = root.querySelector<HTMLElement>(selector)
    if (button && activeElement === button) {
      button.blur()
    }
  }, [])

  useEffect(() => {
    if (!isPromptGenerating) {
      blurButtonIfFocused('.prompt-helper-btn')
    }
  }, [blurButtonIfFocused, isPromptGenerating])

  const handleGenerate = useCallback(async () => {
    try {
      await executeImageGenNode(id)
    } catch (error) {
      console.error(`[image-gen:${id}] execute failed:`, error)
    }
  }, [id])

  const handleGeneratePrompt = useCallback(async () => {
    setIsPromptGenerating(true)

    try {
      const latestStore = useFlowStore.getState()
      const upstreamReferenceImages = latestStore.getUpstreamImages(id)
      latestStore.updateNodeData(id, { upstreamReferenceImages })

      const latestNode = useFlowStore.getState().nodes.find((node) => node.id === id)
      if (!latestNode || latestNode.type !== 'imageGen') {
        throw new Error('图片生成节点不存在')
      }

      const generatedPrompt = await generateImagePrompt(latestNode.data as ImageGenNodeData)
      updateNodeData(id, { prompt: generatedPrompt })
      message.success('出图描述已润色')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '出图描述润色失败'
      message.error(errorMessage)
    } finally {
      setIsPromptGenerating(false)
    }
  }, [id, updateNodeData])

  const handleApplyQuickTemplate = useCallback(
    (templateId: string) => {
      const template = IMAGE_QUICK_TEMPLATES.find((item) => item.id === templateId)
      if (!template) return

      const latestNode = useFlowStore.getState().nodes.find((node) => node.id === id)
      const latestData = latestNode?.type === 'imageGen' ? (latestNode.data as ImageGenNodeData) : data

      updateNodeData(id, {
        prompt: appendPromptLine(latestData.prompt, template.prompt),
        aspectRatio: template.aspectRatio ?? latestData.aspectRatio,
        resolution: template.resolution ?? latestData.resolution,
      })
    },
    [data, id, updateNodeData]
  )

  const handleApplyQuickChip = useCallback(
    (fragment: string) => {
      const latestNode = useFlowStore.getState().nodes.find((node) => node.id === id)
      const latestData = latestNode?.type === 'imageGen' ? (latestNode.data as ImageGenNodeData) : data

      updateNodeData(id, {
        prompt: appendPromptFragment(latestData.prompt, fragment),
      })
    },
    [data, id, updateNodeData]
  )

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

  const handleOpenReferenceUpload = useCallback(() => {
    if (data.isUploadingReferences) return
    fileInputRef.current?.click()
  }, [data.isUploadingReferences])

  const handleReferenceUploadChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
      if (files.length === 0) return

      updateNodeData(id, {
        isUploadingReferences: true,
        referenceUploadError: undefined,
      })

      try {
        const uploadResults = await Promise.allSettled(files.map((file) => uploadImageAsset(file)))
        const successUrls = uploadResults
          .filter(
            (result): result is PromiseFulfilledResult<UploadedAssetResponse> => result.status === 'fulfilled'
          )
          .map((result) => result.value.url)
        const failedUploads = uploadResults.filter(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
        )

        if (successUrls.length === 0) {
          const errorMessage = failedUploads[0]?.reason instanceof Error
            ? failedUploads[0].reason.message
            : '参考图上传失败'

          updateNodeData(id, {
            isUploadingReferences: false,
            referenceUploadError: errorMessage,
          })
          message.error(errorMessage)
          return
        }

        const latestNode = useFlowStore.getState().nodes.find((node) => node.id === id)
        const currentManualReferenceImages = latestNode?.type === 'imageGen'
          ? ((latestNode.data as ImageGenNodeData).manualReferenceImages ?? [])
          : (data.manualReferenceImages ?? [])
        const nextManualReferenceImages = Array.from(new Set([...currentManualReferenceImages, ...successUrls]))
        const partialFailureMessage = failedUploads.length > 0
          ? `${failedUploads.length} 张参考图上传失败`
          : undefined

        updateNodeData(id, {
          manualReferenceImages: nextManualReferenceImages,
          isUploadingReferences: false,
          referenceUploadError: partialFailureMessage,
        })

        message.success(`已上传 ${successUrls.length} 张参考图`)

        if (partialFailureMessage) {
          message.warning(partialFailureMessage)
        }
      } finally {
        event.target.value = ''
      }
    },
    [data.manualReferenceImages, id, updateNodeData]
  )

  const handleRemoveManualReference = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, imageUrl: string) => {
      event.stopPropagation()
      updateNodeData(id, {
        manualReferenceImages: (data.manualReferenceImages ?? []).filter((item) => item !== imageUrl),
        referenceUploadError: undefined,
      })
    },
    [data.manualReferenceImages, id, updateNodeData]
  )

  const isProcessing = data.status === 'processing' || data.status === 'queued'
  const isDisabled = (data as Record<string, unknown>).disabled === true
  const needsRefresh = data.needsRefresh === true
  const isBlockedByWorkflowExecution = isWorkflowExecuting && activeExecutionNodeId !== id
  const upstreamReferenceImages = data.upstreamReferenceImages ?? []
  const manualReferenceImages = data.manualReferenceImages ?? []
  const referenceImages = data.referenceImages ?? []
  const isUploadingReferences = data.isUploadingReferences === true
  const referenceUploadError = typeof data.referenceUploadError === 'string' ? data.referenceUploadError : ''
  useEffect(() => {
    if (!isProcessing && (!isWorkflowExecuting || activeExecutionNodeId !== id)) {
      blurButtonIfFocused('.generate-btn')
    }
  }, [activeExecutionNodeId, blurButtonIfFocused, id, isProcessing, isWorkflowExecuting])

  return (
    <>
      <NodeWidthResizer
        nodeId={id}
        selected={selected}
        currentWidth={nodeWidth}
        minWidth={DEFAULT_NODE_SIZES.imageGen.width}
      />
      <div
        ref={nodeRef}
        className={`image-gen-node status-${data.status}${needsRefresh ? ' needs-refresh' : ''}${isDisabled ? ' node-disabled' : ''}`}
        style={{ width: nodeWidth }}
      >
        <Handle type="target" position={Position.Left} className="node-handle handle-kind-image" />

      <div className="node-header">
        <PictureOutlined className="node-icon" />
        <NodeTitleEditor
          value={data.label}
          onChange={(value) => updateNodeData(id, { label: value })}
          className="node-title"
          placeholder="输入节点名称"
        />
        {needsRefresh && !isProcessing && (
          <span className="node-refresh-badge">
            <SyncOutlined /> 需更新
          </span>
        )}
        {isDisabled && <span className="node-disabled-badge">已禁用</span>}
      </div>

      <div className="node-body nodrag nopan nowheel">
        <div className="form-field">
          <div className="field-label-row">
            <label className="field-label">出图描述</label>
            <Button
              type="text"
              size="small"
              icon={<HighlightOutlined />}
              onClick={handleGeneratePrompt}
              loading={isPromptGenerating}
              disabled={isPromptGenerating || isProcessing || isDisabled || isBlockedByWorkflowExecution}
              className="prompt-helper-btn nodrag"
            >
              AI 润色
            </Button>
          </div>
          <NodeTextareaEditor
            variant="native"
            className="prompt-textarea nodrag"
            value={data.prompt}
            onCommit={(value) => updateNodeData(id, { prompt: value })}
            placeholder="描述想看到的主体、场景、动作和画面气质..."
            rows={4}
          />
        </div>

        <div className="form-field">
          <label className="field-label">快捷模板</label>
          <div className="quick-template-grid">
            {IMAGE_QUICK_TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                className="quick-template-card"
                onClick={() => handleApplyQuickTemplate(template.id)}
                title={`${template.label}：${template.hint}`}
                disabled={isUploadingReferences || isProcessing || isDisabled || isBlockedByWorkflowExecution}
              >
                <span className="quick-template-title">{template.label}</span>
                <span className="quick-template-hint">{template.hint}</span>
              </button>
            ))}
          </div>
          <div className="quick-chip-row">
            {IMAGE_QUICK_PROMPT_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className="quick-chip-button"
                onClick={() => handleApplyQuickChip(chip.prompt)}
                disabled={isUploadingReferences || isProcessing || isDisabled || isBlockedByWorkflowExecution}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="quick-template-tip">点击模板会补入基础画面方向，并同步建议比例 / 分辨率。</div>
        </div>

        <div className="form-row">
          <div className="form-field flex-1">
            <label className="field-label">画面比例</label>
            <Select
              size="small"
              value={data.aspectRatio}
              onChange={(value) => updateNodeData(id, { aspectRatio: value })}
              options={aspectRatioOptions}
              className="field-select nodrag nopan"
            />
          </div>
          <div className="form-field flex-1">
            <label className="field-label">分辨率</label>
            <Select
              size="small"
              value={data.resolution}
              onChange={(value) => updateNodeData(id, { resolution: value })}
              options={resolutionOptions}
              className="field-select nodrag nopan"
            />
          </div>
        </div>

        <div className="form-field">
          <label className="field-label">参考图</label>
          <div className="ref-images-row">
            {referenceImages.map((imageUrl, index) => {
              const isManualReference = manualReferenceImages.includes(imageUrl)

              return (
                <div
                  key={`${imageUrl}-${index}`}
                  className={`ref-image-card ${isManualReference ? 'is-manual' : 'is-upstream'}`}
                  title={isManualReference ? '手动补充的参考图' : '来自上游节点的参考图'}
                >
                  <button
                    type="button"
                    className="ref-image-button"
                    onClick={() => handlePreviewReference(imageUrl, index)}
                  >
                    <img src={imageUrl} alt={`参考图 ${index + 1}`} className="ref-image-thumb" />
                  </button>
                  {isManualReference && (
                    <button
                      type="button"
                      className="ref-image-remove"
                      onClick={(event) => handleRemoveManualReference(event, imageUrl)}
                      aria-label="移除参考图"
                    >
                      <CloseOutlined />
                    </button>
                  )}
                </div>
              )
            })}
            <button
              type="button"
              className="ref-image-add"
              onClick={handleOpenReferenceUpload}
              disabled={isUploadingReferences}
              title="补充参考图"
            >
              {isUploadingReferences ? <LoadingOutlined /> : <PlusOutlined />}
            </button>
          </div>
          <div className="ref-images-tip">
            {referenceImages.length > 0
              ? `已接入参考：上游 ${upstreamReferenceImages.length} 张，本地补充 ${manualReferenceImages.length} 张`
              : '可连接角色设定、图片上传或上游出图结果，系统会自动汇总到这里'}
          </div>
          {referenceUploadError && (
            <div className="error-message">{referenceUploadError}</div>
          )}
        </div>

        {needsRefresh && !isProcessing && (
          <div className="refresh-tip">
            上游参考或当前参数已变化，建议重新出图以同步最新画面。
          </div>
        )}

        {(data.status === 'processing' || data.status === 'queued') && (
          <div className="progress-bar">
            <Progress
              percent={data.progress}
              size="small"
              status={data.status === 'queued' ? 'normal' : 'active'}
              strokeColor="#1677ff"
            />
          </div>
        )}

        {data.status === 'error' && data.errorMessage && (
          <div className="error-message">{data.errorMessage}</div>
        )}

        <Button
          type="primary"
          block
          onClick={handleGenerate}
          loading={isProcessing || (isWorkflowExecuting && activeExecutionNodeId === id)}
          disabled={isDisabled || isBlockedByWorkflowExecution}
          className="generate-btn nodrag"
        >
          {data.status === 'queued'
            ? '排队中...'
            : isProcessing || (isWorkflowExecuting && activeExecutionNodeId === id)
              ? '出图中...'
              : isBlockedByWorkflowExecution
                ? '工作流执行中，请稍候'
                : needsRefresh ? '重新出图' : '开始出图'}
        </Button>
      </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleReferenceUploadChange}
          style={{ display: 'none' }}
        />

        <Handle type="source" position={Position.Right} className="node-handle handle-kind-image" />
      </div>
    </>
  )
})

ImageGenNode.displayName = 'ImageGenNode'

export default ImageGenNode
