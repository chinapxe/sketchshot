import { memo, useCallback, useRef } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { CustomerServiceOutlined, DownloadOutlined } from '@ant-design/icons'
import { Button, Progress, Select, message } from 'antd'

import { useFlowStore } from '../../../stores/useFlowStore'
import { createTTSAudioTask } from '../../../services/api'
import type { TTSNode as TTSNodeType } from '../../../types'
import type { NodeStatus } from '../../../types'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTitleEditor from '../shared/NodeTitleEditor'
import VoiceCloneManager from '../shared/VoiceCloneManager'
import { TTS_VOICE_GROUPS } from '../../../config/ttsVoices'
import './style.css'

const speechRateOptions = [
  { value: -30, label: '慢速' },
  { value: -15, label: '较慢' },
  { value: 0, label: '正常' },
  { value: 15, label: '较快' },
  { value: 30, label: '快速' },
]

const loudnessRateOptions = [
  { value: -30, label: '小声' },
  { value: -15, label: '较小' },
  { value: 0, label: '正常' },
  { value: 15, label: '较大' },
  { value: 30, label: '大声' },
]

const TTSNode = memo(({ id, data, selected = false }: NodeProps<TTSNodeType>) => {
  const nodeRef = useRef<HTMLDivElement>(null)
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const syncDownstream = useFlowStore((state) => state.syncDownstream)
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.tts.width)

  const isGenerating = data.isTTSExporting === true
  const hasAudio = Boolean(data.ttsAudioUrl)

  const handleGenerate = useCallback(async () => {
    if (!data.text) {
      message.warning('请输入要合成的文本')
      return
    }

    updateNodeData(id, { isTTSExporting: true })

    try {
      const result = await createTTSAudioTask({
        node_id: id,
        text: data.text,
        voice: data.voice,
        speech_rate: data.speechRate,
        loudness_rate: data.loudnessRate,
      })

      if (result.success && result.audio_url) {
        updateNodeData(id, {
          ttsAudioUrl: result.audio_url,
          isTTSExporting: false,
          errorMessage: undefined,
          status: 'success' as NodeStatus,
        })
        syncDownstream(id)
        message.success('语音合成完成')
      } else {
        updateNodeData(id, {
          isTTSExporting: false,
          errorMessage: result.error || '语音合成失败',
          status: 'error' as NodeStatus,
        })
        message.error(result.error || '语音合成失败')
      }
    } catch (error) {
      updateNodeData(id, {
        isTTSExporting: false,
        errorMessage: error instanceof Error ? error.message : '请求失败',
        status: 'error' as NodeStatus,
      })
      message.error(error instanceof Error ? error.message : '请求失败')
    }
  }, [id, data.text, data.voice, data.speechRate, data.loudnessRate, updateNodeData, syncDownstream])

  const handleDownload = useCallback(() => {
    if (data.ttsAudioUrl) {
      const a = document.createElement('a')
      a.href = data.ttsAudioUrl
      a.download = `tts-${Date.now()}.mp3`
      a.click()
    }
  }, [data.ttsAudioUrl])

  const rootClass = [
    'tts-node',
    selected ? ' selected' : '',
    data.status === 'error' ? ' status-error' : '',
    isGenerating ? ' status-processing' : '',
  ].join('')

  return (
    <div ref={nodeRef} className={rootClass} style={{ width: nodeWidth }}>
      <Handle type="source" position={Position.Right} className="node-handle handle-kind-audio" id="audio-output" />

      <div className="node-header">
        <CustomerServiceOutlined className="node-header-icon" />
        <NodeTitleEditor
          value={data.label}
          onCommit={(value) => updateNodeData(id, { label: value })}
        />
        {hasAudio && <span className="node-status-badge status-success">完成</span>}
        {data.status === 'error' && <span className="node-status-badge status-error">失败</span>}
        {isGenerating && <span className="node-status-badge status-processing">生成中...</span>}
      </div>

      <div className="node-body">
        <div className="form-field">
          <label className="field-label">文本</label>
          <textarea
            className="tts-textarea nodrag"
            rows={4}
            placeholder="输入要合成语音的文本..."
            value={data.text}
            onChange={(e) => updateNodeData(id, { text: e.target.value })}
          />
        </div>

        <div className="form-field">
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

        <VoiceCloneManager
          onSelectVoice={(voiceId) => updateNodeData(id, { voice: voiceId })}
          selectedVoice={data.voice}
        />

        <div className="form-row">
          <div className="form-field flex-1">
            <label className="field-label">语速</label>
            <Select
              size="small"
              value={data.speechRate ?? 0}
              onChange={(value) => updateNodeData(id, { speechRate: value })}
              options={speechRateOptions}
              className="field-select nodrag nopan"
            />
          </div>
          <div className="form-field flex-1">
            <label className="field-label">音量</label>
            <Select
              size="small"
              value={data.loudnessRate ?? 0}
              onChange={(value) => updateNodeData(id, { loudnessRate: value })}
              options={loudnessRateOptions}
              className="field-select nodrag nopan"
            />
          </div>
        </div>

        <div className="form-actions">
          <Button
            type="primary"
            block
            size="small"
            onClick={handleGenerate}
            loading={isGenerating}
            disabled={!data.text || isGenerating}
          >
            {isGenerating ? '生成中...' : '生成语音'}
          </Button>
        </div>

        {isGenerating && (
          <div className="form-field">
            <Progress percent={50} size="small" showInfo={false} strokeColor="#1677ff" />
            <div className="tts-progress-text">语音合成中...</div>
          </div>
        )}

        {hasAudio && (
          <div className="form-field">
            <label className="field-label">生成结果</label>
            <div className="tts-audio-card">
              <audio src={data.ttsAudioUrl} controls className="tts-audio-element" />
              <button type="button" className="tts-download-btn nodrag nopan" onClick={handleDownload}>
                <DownloadOutlined /> 下载音频
              </button>
            </div>
          </div>
        )}

        {data.status === 'error' && data.errorMessage && (
          <div className="tts-error-message">{data.errorMessage}</div>
        )}
      </div>

      <NodeWidthResizer nodeId={id} nodeWidth={nodeWidth} />
    </div>
  )
})

TTSNode.displayName = 'TTSNode'

export default TTSNode
