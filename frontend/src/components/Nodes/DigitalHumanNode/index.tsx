import { memo, useCallback, useEffect, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { CustomerServiceOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons'
import { Button, Progress, Radio, Select, message } from 'antd'

import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import { createDigitalHumanTask, createTTSAudioTask, uploadImageAsset } from '../../../services/api'
import type { DigitalHumanNode as DigitalHumanNodeType } from '../../../types'
import type { DigitalHumanNodeData, NodeStatus } from '../../../types'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTitleEditor from '../shared/NodeTitleEditor'
import VoiceCloneManager from '../shared/VoiceCloneManager'
import { TTS_VOICE_GROUPS } from '../../../config/ttsVoices'
import './style.css'

const styleOptions = [
  { value: 'speech', label: '说话' },
  { value: 'singing', label: '唱歌' },
  { value: 'performance', label: '表演' },
]

const resolutionOptions = [
  { value: '480P', label: '480P' },
  { value: '720P', label: '720P' },
]

const DigitalHumanNode = memo(({ id, data, selected = false }: NodeProps<DigitalHumanNodeType>) => {
  const nodeRef = useRef<HTMLDivElement>(null)
  const audioFileInputRef = useRef<HTMLInputElement>(null)
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const getUpstreamImages = useFlowStore((state) => state.getUpstreamImages)
  const edges = useFlowStore((state) => state.edges)
  const isWorkflowExecuting = useFlowStore((state) => state.isWorkflowExecuting)
  const activeExecutionNodeId = useFlowStore((state) => state.activeExecutionNodeId)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.digitalHuman.width)

  useEffect(() => {
    const upstreamImages = getUpstreamImages(id)
    if (upstreamImages.length > 0) {
      updateNodeData(id, { sourceImage: upstreamImages[0] })
    }
  }, [edges, getUpstreamImages, id, updateNodeData])

  const isProcessing = data.status === 'processing' || data.status === 'queued'
  const isBlockedByWorkflowExecution = isWorkflowExecuting && activeExecutionNodeId !== id
  const canGenerate = !isProcessing && !isBlockedByWorkflowExecution
  const needsRefresh = data.status === 'success' && data.sourceImage
  const isTextMode = (data.inputMode ?? 'text') === 'text'
  const effectiveAudioUrl = data.audioUrl

  const handleGenerate = useCallback(async () => {
    const hasAudio = Boolean(effectiveAudioUrl)

    if (!hasAudio && !data.text) {
      updateNodeData(id, {
        status: 'error' as NodeStatus,
        errorMessage: '请提供说话文本或连接音频输入',
      })
      message.warning('请提供说话文本或连接音频输入')
      return
    }

    if (!data.sourceImage) {
      updateNodeData(id, { status: 'error' as NodeStatus, errorMessage: '请先连接角色图片输入' })
      message.warning('请先连接角色图片输入')
      return
    }

    updateNodeData(id, {
      status: 'queued' as NodeStatus,
      progress: 0,
      errorMessage: undefined,
    })

    try {
      const result = await createDigitalHumanTask({
        node_id: id,
        text: effectiveAudioUrl ? '' : data.text,
        source_image: data.sourceImage,
        audio_url: effectiveAudioUrl || undefined,
        voice: data.voice,
        style: data.style,
        resolution: data.resolution,
        adapter: 'happyhorse',
      })

      updateNodeData(id, {
        status: 'processing' as NodeStatus,
        progress: 10,
      })

      const poll = async () => {
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL ?? ''}/api/generate/${result.task_id}/status`
        )
        const status = await response.json()

        if (status.status === 'processing' || status.status === 'pending') {
          updateNodeData(id, { progress: status.progress ?? 50 })
          setTimeout(poll, 2000)
          return
        }

        if (status.status === 'success' && status.output_video) {
          updateNodeData(id, {
            status: 'success' as NodeStatus,
            progress: 100,
            outputVideo: status.output_video,
            errorMessage: undefined,
          })
          message.success('数字人生成完成')
          return
        }

        updateNodeData(id, {
          status: 'error' as NodeStatus,
          errorMessage: status.error_message || '数字人生成失败',
        })
        message.error(status.error_message || '数字人生成失败')
      }

      setTimeout(poll, 2000)
    } catch (error) {
      updateNodeData(id, {
        status: 'error' as NodeStatus,
        errorMessage: error instanceof Error ? error.message : '请求失败',
      })
      message.error(error instanceof Error ? error.message : '请求失败')
    }
  }, [
    id,
    data.text,
    data.audioUrl,
    data.sourceImage,
    data.voice,
    data.style,
    data.resolution,
    effectiveAudioUrl,
    updateNodeData,
  ])

  const handleExportTTS = useCallback(async () => {
    if (!data.text) {
      message.warning('请输入说话文本')
      return
    }

    updateNodeData(id, { isTTSExporting: true })

    try {
      const result = await createTTSAudioTask({
        node_id: id,
        text: data.text,
        voice: data.voice,
      })

      if (result.success && result.audio_url) {
        updateNodeData(id, {
          ttsAudioUrl: result.audio_url,
          isTTSExporting: false,
        })
        message.success('音频导出成功')
      } else {
        updateNodeData(id, { isTTSExporting: false })
        message.error(result.error || '音频导出失败')
      }
    } catch (error) {
      updateNodeData(id, { isTTSExporting: false })
      message.error(error instanceof Error ? error.message : '音频导出失败')
    }
  }, [id, data.text, data.voice, updateNodeData])

  const handleAudioUploadClick = useCallback(() => {
    audioFileInputRef.current?.click()
  }, [])

  const handleAudioFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return

      updateNodeData(id, { isUploading: true, uploadError: undefined })

      try {
        const uploadedAsset = await uploadImageAsset(file)
        updateNodeData(id, {
          audioUrl: uploadedAsset.url,
          audioFileName: uploadedAsset.file_name,
          isUploading: false,
          uploadError: undefined,
        })
        message.success('音频上传成功')
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '上传失败'
        updateNodeData(id, { isUploading: false, uploadError: errorMessage })
        message.error(errorMessage)
      } finally {
        event.target.value = ''
      }
    },
    [id, updateNodeData],
  )

  const handleModeChange = useCallback(
    (mode: 'text' | 'audio') => {
      updateNodeData(id, { inputMode: mode })
    },
    [id, updateNodeData],
  )

  const getStatusBadge = () => {
    if (isProcessing) return <span className="node-status-badge status-processing">处理中...</span>
    if (data.status === 'error') return <span className="node-status-badge status-error">失败</span>
    if (data.status === 'success') return <span className="node-status-badge status-success">完成</span>
    return null
  }

  const handlePreviewOutput = useCallback(() => {
    if (data.outputVideo) {
      openPreview(data.outputVideo)
    }
  }, [data.outputVideo, openPreview])

  // Build class names
  const rootClass = [
    'digital-human-node',
    selected ? ' selected' : '',
    data.status === 'success' ? ' status-success' : '',
    data.status === 'error' ? ' status-error' : '',
    isProcessing ? ' status-processing' : '',
  ].join('')

  return (
    <div ref={nodeRef} className={rootClass} style={{ width: nodeWidth }}>
      <Handle type="target" position={Position.Left} className="node-handle handle-kind-image" />
      <Handle type="target" position={Position.Left} className="node-handle handle-kind-audio" id="audio-input" />
      <Handle type="source" position={Position.Right} className="node-handle handle-kind-video" />

      <div className="node-header">
        <CustomerServiceOutlined className="node-header-icon" />
        <NodeTitleEditor
          value={data.label}
          onCommit={(value) => updateNodeData(id, { label: value })}
        />
        {getStatusBadge()}
      </div>

      <div className="node-body">
        {/* Character image — shared */}
        {data.sourceImage ? (
          <div className="form-field">
            <label className="field-label">角色图片</label>
            <div className="dh-image-preview">
              {/^(https?:|\/)/.test(data.sourceImage) ? (
                <img src={data.sourceImage} alt="角色" className="dh-image-preview-img" />
              ) : (
                <div className="dh-image-preview-img dh-image-preview-placeholder">官方人像 (asset://)</div>
              )}
            </div>
          </div>
        ) : (
          <div className="form-field">
            <label className="field-label">角色图片</label>
            <div className="dh-empty-placeholder">请连接上游角色图片</div>
          </div>
        )}

        {/* Input mode toggle */}
        <div className="form-field">
          <label className="field-label">输入方式</label>
          <Radio.Group
            size="small"
            value={isTextMode ? 'text' : 'audio'}
            onChange={(e) => handleModeChange(e.target.value)}
            className="dh-mode-toggle nodrag nopan"
          >
            <Radio.Button value="text">文本驱动</Radio.Button>
            <Radio.Button value="audio">音频驱动</Radio.Button>
          </Radio.Group>
        </div>

        {/* Text mode: textarea + voice + export */}
        {isTextMode && (
          <>
            <div className="form-field">
              <label className="field-label">说话文本</label>
              <textarea
                className="dh-textarea nodrag"
                rows={3}
                placeholder="输入说话文本..."
                value={data.text}
                onChange={(e) => updateNodeData(id, { text: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-field flex-1">
                <label className="field-label">语音</label>
                <Select
                  size="small"
                  value={data.voice}
                  onChange={(value) => updateNodeData(id, { voice: value })}
                  options={TTS_VOICE_GROUPS}
                  showSearch
                  optionFilterProp="label"
                  className="field-select nodrag nopan"
                />
              </div>
              <div className="form-field flex-1">
                <label className="field-label">风格</label>
                <Select
                  size="small"
                  value={data.style}
                  onChange={(value) => updateNodeData(id, { style: value })}
                  options={styleOptions}
                  className="field-select nodrag nopan"
                />
              </div>
            </div>

            <VoiceCloneManager
              onSelectVoice={(voiceId) => updateNodeData(id, { voice: voiceId })}
              selectedVoice={data.voice}
            />

            {/* TTS standalone export */}
            <div className="form-field">
              <label className="field-label">音频导出</label>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={handleExportTTS}
                loading={data.isTTSExporting}
                disabled={!data.text || isProcessing}
                className="nodrag nopan"
                block
              >
                {data.isTTSExporting ? '导出中...' : '导出音频'}
              </Button>
            </div>

            {data.ttsAudioUrl && (
              <div className="dh-tts-audio-player">
                <audio src={data.ttsAudioUrl} controls className="dh-audio-element" />
                <a
                  href={data.ttsAudioUrl}
                  download
                  className="dh-download-link nodrag nopan"
                >
                  <DownloadOutlined /> 下载文件
                </a>
              </div>
            )}
          </>
        )}

        {/* Audio mode: upload area */}
        {!isTextMode && (
          <>
            <div className="form-field">
              <label className="field-label">上传音频</label>
              <div
                className={`dh-upload-area${data.audioUrl ? ' has-audio' : ''} nodrag nopan`}
                onClick={handleAudioUploadClick}
              >
                {data.audioUrl ? (
                  <div className="dh-audio-uploaded">
                    <audio src={data.audioUrl} controls className="dh-audio-element" />
                    <div className="dh-upload-hint">
                      {data.isUploading ? '上传中...' : '点击重新上传'}
                    </div>
                  </div>
                ) : (
                  <div className="dh-upload-placeholder">
                    <UploadOutlined className="upload-icon" />
                    <span>{data.isUploading ? '上传中...' : '点击上传音频文件'}</span>
                  </div>
                )}
              </div>
              {data.uploadError && <div className="dh-error-message">{data.uploadError}</div>}
            </div>

            <div className="form-row">
              <div className="form-field flex-1">
                <label className="field-label">风格</label>
                <Select
                  size="small"
                  value={data.style}
                  onChange={(value) => updateNodeData(id, { style: value })}
                  options={styleOptions}
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
          </>
        )}

        {/* Resolution for text mode */}
        {isTextMode && (
          <div className="form-row">
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
        )}

        {/* Hidden file input for audio upload */}
        <input
          ref={audioFileInputRef}
          type="file"
          accept="audio/mpeg,audio/wav,audio/ogg,audio/mp4"
          onChange={handleAudioFileChange}
          style={{ display: 'none' }}
        />

        {needsRefresh && !isProcessing && (
          <div className="dh-pricing-note">
            角色图片已变化，建议重新生成。
          </div>
        )}

        {/* Result video preview — shared */}
        {data.outputVideo && (
          <div className="form-field">
            <label className="field-label">生成结果</label>
            <button type="button" className="dh-output-card" onClick={handlePreviewOutput}>
              <video
                className="dh-output-media"
                src={data.outputVideo}
                loop
                muted
                playsInline
              />
              <div className="dh-output-hint">点击预览</div>
            </button>
          </div>
        )}

        {/* Progress — shared */}
        {isProcessing && (
          <div className="form-field">
            <Progress percent={data.progress} size="small" showInfo={false} strokeColor="#1677ff" />
            <div className="dh-progress-text">
              {data.status === 'queued' ? '排队中...' : `处理中 ${data.progress}%`}
            </div>
          </div>
        )}

        {/* Error — shared */}
        {data.status === 'error' && data.errorMessage && (
          <div className="dh-error-message">{data.errorMessage}</div>
        )}

        <div className="dh-pricing-note">
          按生成视频时长计费（480P: ¥0.5/秒, 720P: ¥0.9/秒）
        </div>

        {/* Generate button — shared */}
        <div className="form-actions">
          <Button
            type="primary"
            block
            size="small"
            onClick={handleGenerate}
            disabled={!canGenerate}
            loading={isProcessing}
          >
            {isProcessing ? '处理中...' : '生成数字人'}
          </Button>
        </div>
      </div>

      <NodeWidthResizer nodeId={id} nodeWidth={nodeWidth} />
    </div>
  )
})

DigitalHumanNode.displayName = 'DigitalHumanNode'

export default DigitalHumanNode
