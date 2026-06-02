import { memo, useCallback, useEffect, useState } from 'react'
import { DeleteOutlined, PlusOutlined, SoundOutlined, UploadOutlined } from '@ant-design/icons'
import { Button, Input, List, Upload, message } from 'antd'

import {
  cloneVoice,
  deleteClonedVoice,
  listClonedVoices,
} from '../../../../services/api'
import type { ClonedVoiceItem } from '../../../../config/ttsVoices'
import './style.css'

interface Props {
  /** Called when the user selects a cloned voice for use. */
  onSelectVoice: (voiceId: string) => void
  /** The currently selected voice ID (cloned or system). */
  selectedVoice?: string
}

const VoiceCloneManager = memo(({ onSelectVoice, selectedVoice }: Props) => {
  const [voices, setVoices] = useState<ClonedVoiceItem[]>([])
  const [name, setName] = useState('')
  const [rawFile, setRawFile] = useState<File | null>(null)
  const [cloning, setCloning] = useState(false)

  const loadVoices = useCallback(async () => {
    try {
      const result = await listClonedVoices()
      setVoices(result.voices)
    } catch {
      // silent — list may fail if backend is not running
    }
  }, [])

  useEffect(() => {
    loadVoices()
  }, [loadVoices])

  const handleClone = useCallback(async () => {
    if (!rawFile) {
      message.warning('请先上传音频文件')
      return
    }
    if (!name.trim()) {
      message.warning('请输入音色名称')
      return
    }

    setCloning(true)
    try {
      const buffer = await rawFile.arrayBuffer()
      const base64 = btoa(
        new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ''),
      )

      await cloneVoice({
        audio_base64: base64,
        audio_mime_type: rawFile.type || 'audio/mpeg',
        name: name.trim(),
      })

      message.success(`音色 "${name.trim()}" 克隆成功`)
      setName('')
      setRawFile(null)
      await loadVoices()
    } catch (err) {
      message.error(err instanceof Error ? err.message : '声音复刻失败')
    } finally {
      setCloning(false)
    }
  }, [rawFile, name, loadVoices])

  const handleDelete = useCallback(
    async (voiceId: string) => {
      try {
        await deleteClonedVoice(voiceId)
        message.success('音色已删除')
        await loadVoices()
      } catch (err) {
        message.error(err instanceof Error ? err.message : '删除失败')
      }
    },
    [loadVoices],
  )

  return (
    <div className="voice-clone-manager nodrag nopan">
      <div className="vc-section-title">
        <SoundOutlined /> 声音复刻
      </div>

      <div className="vc-form">
        <div className="vc-field">
          <label className="vc-label">音频样本 (10-60秒)</label>
          <Upload
            accept="audio/*"
            maxCount={1}
            fileList={
              rawFile
                ? [{ uid: 'audio-sample', name: rawFile.name, status: 'done' as const }]
                : []
            }
            beforeUpload={(file) => {
              setRawFile(file)
              return false
            }}
            onRemove={() => setRawFile(null)}
          >
            <Button icon={<UploadOutlined />} size="small">
              选择音频
            </Button>
          </Upload>
        </div>

        <div className="vc-field">
          <label className="vc-label">音色名称</label>
          <div className="vc-name-row">
            <Input
              size="small"
              placeholder="例如：我的音色"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              type="primary"
              size="small"
              icon={<PlusOutlined />}
              onClick={handleClone}
              loading={cloning}
              disabled={!rawFile || !name.trim()}
            >
              克隆
            </Button>
          </div>
        </div>
      </div>

      {voices.length > 0 && (
        <div className="vc-voices-list">
          <div className="vc-label">已复刻音色</div>
          <List
            size="small"
            dataSource={voices}
            renderItem={(item) => (
              <List.Item
                className={`vc-voice-item${selectedVoice === item.voice_id ? ' vc-selected' : ''}`}
                onClick={() => onSelectVoice(item.voice_id)}
                actions={[
                  <DeleteOutlined
                    key="delete"
                    className="vc-delete-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(item.voice_id)
                    }}
                  />,
                ]}
              >
                <List.Item.Meta
                  title={item.name}
                  description={item.voice_id}
                />
              </List.Item>
            )}
          />
        </div>
      )}
    </div>
  )
})

VoiceCloneManager.displayName = 'VoiceCloneManager'

export default VoiceCloneManager
