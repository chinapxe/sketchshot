/**
 * Image generation node.
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
import { Button, Progress, Select, Slider, Switch, message } from 'antd'

import { uploadImageAsset, type UploadedAssetResponse } from '../../../services/api'
import { disconnectNodeGeneration, executeImageGenNode } from '../../../services/nodeGeneration'
import { generateImagePrompt } from '../../../services/promptGeneration'
import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { ImageGenNode as ImageGenNodeType, ImageGenNodeData } from '../../../types'
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

const adapterOptions = [
  { value: 'auto', label: 'Auto' },
  { value: 'volcengine', label: 'Volcengine' },
  { value: 'comfyui', label: 'ComfyUI' },
  { value: 'mock', label: 'Mock' },
]

const ImageGenNode = memo(({ id, data }: NodeProps<ImageGenNodeType>) => {
  const nodeRef = useRef<HTMLDivElement>(null)
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const getUpstreamImages = useFlowStore((state) => state.getUpstreamImages)
  const edges = useFlowStore((state) => state.edges)
  const isWorkflowExecuting = useFlowStore((state) => state.isWorkflowExecuting)
  const activeExecutionNodeId = useFlowStore((state) => state.activeExecutionNodeId)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isPromptGenerating, setIsPromptGenerating] = useState(false)

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

  const handlePromptChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateNodeData(id, { prompt: event.target.value })
    },
    [id, updateNodeData]
  )

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
        throw new Error('Image generation node not found')
      }

      const generatedPrompt = await generateImagePrompt(latestNode.data as ImageGenNodeData)
      updateNodeData(id, { prompt: generatedPrompt })
      message.success('Prompt refined for image generation')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Prompt refinement failed'
      message.error(errorMessage)
    } finally {
      setIsPromptGenerating(false)
    }
  }, [id, updateNodeData])

  const handlePreviewReference = useCallback(
    (imageUrl: string, index: number) => {
      openPreview({
        type: 'image',
        src: imageUrl,
        title: `${data.label} - Ref ${index + 1}`,
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
            : 'Upload failed'

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
          ? `${failedUploads.length} upload(s) failed`
          : undefined

        updateNodeData(id, {
          manualReferenceImages: nextManualReferenceImages,
          isUploadingReferences: false,
          referenceUploadError: partialFailureMessage,
        })

        message.success(
          successUrls.length === 1 ? 'Reference image uploaded' : `${successUrls.length} reference images uploaded`
        )

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
  const canUseIdentityLock = referenceImages.length > 0

  useEffect(() => {
    if (!isProcessing && (!isWorkflowExecuting || activeExecutionNodeId !== id)) {
      blurButtonIfFocused('.generate-btn')
    }
  }, [activeExecutionNodeId, blurButtonIfFocused, id, isProcessing, isWorkflowExecuting])

  return (
    <div
      ref={nodeRef}
      className={`image-gen-node status-${data.status}${needsRefresh ? ' needs-refresh' : ''}${isDisabled ? ' node-disabled' : ''}`}
    >
      <Handle type="target" position={Position.Left} className="node-handle" />

      <div className="node-header">
        <PictureOutlined className="node-icon" />
        <span className="node-title">{data.label}</span>
        {needsRefresh && !isProcessing && (
          <span className="node-refresh-badge">
            <SyncOutlined /> Needs Refresh
          </span>
        )}
        {isDisabled && <span className="node-disabled-badge">Disabled</span>}
      </div>

      <div className="node-body">
        <div className="form-field">
          <div className="field-label-row">
            <label className="field-label">Prompt</label>
            <Button
              type="text"
              size="small"
              icon={<HighlightOutlined />}
              onClick={handleGeneratePrompt}
              loading={isPromptGenerating}
              disabled={isPromptGenerating || isProcessing || isDisabled || isBlockedByWorkflowExecution}
              className="prompt-helper-btn"
            >
              AI Refine
            </Button>
          </div>
          <textarea
            className="prompt-textarea"
            value={data.prompt}
            onChange={handlePromptChange}
            placeholder="Describe the image you want to generate..."
            rows={4}
          />
        </div>

        <div className="form-row">
          <div className="form-field flex-1">
            <label className="field-label">Ratio</label>
            <Select
              size="small"
              value={data.aspectRatio}
              onChange={(value) => updateNodeData(id, { aspectRatio: value })}
              options={aspectRatioOptions}
              className="field-select"
            />
          </div>
          <div className="form-field flex-1">
            <label className="field-label">Resolution</label>
            <Select
              size="small"
              value={data.resolution}
              onChange={(value) => updateNodeData(id, { resolution: value })}
              options={resolutionOptions}
              className="field-select"
            />
          </div>
        </div>

        <div className="form-field">
          <label className="field-label">Adapter</label>
          <Select
            size="small"
            value={data.adapter ?? 'volcengine'}
            onChange={(value) => updateNodeData(id, { adapter: value })}
            options={adapterOptions}
            className="field-select"
          />
        </div>

        <div className="form-field">
          <label className="field-label">References</label>
          <div className="ref-images-row">
            {referenceImages.map((imageUrl, index) => {
              const isManualReference = manualReferenceImages.includes(imageUrl)

              return (
                <div
                  key={`${imageUrl}-${index}`}
                  className={`ref-image-card ${isManualReference ? 'is-manual' : 'is-upstream'}`}
                  title={isManualReference ? 'Manual reference image' : 'Linked upstream reference'}
                >
                  <button
                    type="button"
                    className="ref-image-button"
                    onClick={() => handlePreviewReference(imageUrl, index)}
                  >
                    <img src={imageUrl} alt={`reference-${index + 1}`} className="ref-image-thumb" />
                  </button>
                  {isManualReference && (
                    <button
                      type="button"
                      className="ref-image-remove"
                      onClick={(event) => handleRemoveManualReference(event, imageUrl)}
                      aria-label="Remove reference image"
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
              title="Upload reference images"
            >
              {isUploadingReferences ? <LoadingOutlined /> : <PlusOutlined />}
            </button>
          </div>
          <div className="ref-images-tip">
            Linked: {upstreamReferenceImages.length} | Manual: {manualReferenceImages.length}
          </div>
          {referenceUploadError && (
            <div className="error-message">{referenceUploadError}</div>
          )}
        </div>

        <div className="form-field">
          <label className="field-label">Identity Lock</label>
          <Switch
            checked={data.identityLock ?? false}
            disabled={!canUseIdentityLock}
            onChange={(checked) => updateNodeData(id, { identityLock: checked })}
          />
          {!canUseIdentityLock && (
            <div className="refresh-tip">
              Add a reference image first to enable character consistency.
            </div>
          )}
        </div>

        {canUseIdentityLock && (data.identityLock ?? false) && (
          <div className="form-field">
            <label className="field-label">Identity Strength</label>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={data.identityStrength ?? 0.7}
              onChange={(value) => updateNodeData(id, { identityStrength: Number(value) })}
              tooltip={{ formatter: (value) => `${Math.round((value ?? 0) * 100)}%` }}
            />
          </div>
        )}

        {needsRefresh && !isProcessing && (
          <div className="refresh-tip">
            Upstream inputs or current parameters changed. Run generation again to sync the latest output.
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
          className="generate-btn"
        >
          {data.status === 'queued'
            ? 'Queued...'
            : isProcessing || (isWorkflowExecuting && activeExecutionNodeId === id)
              ? 'Generating...'
              : isBlockedByWorkflowExecution
                ? 'Workflow Running...'
                : `${needsRefresh ? 'Regenerate Image' : 'Generate Image'} - ${data.creditCost}`}
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

      <Handle type="source" position={Position.Right} className="node-handle" />
    </div>
  )
})

ImageGenNode.displayName = 'ImageGenNode'

export default ImageGenNode
