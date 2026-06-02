import { memo, useCallback, useEffect, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { DeleteOutlined, LinkOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons'
import { Button, Input, Progress, Segmented, Spin, message } from 'antd'

import { createGenerateTask, listCharacters, saveCharacter, deleteCharacter, listOfficialCharacters, refreshOfficialThumbnails, type CharacterItem, type OfficialCharacterItem } from '../../../services/api'
import { connectProgress } from '../../../services/websocket'
import { useAssetPreviewStore } from '../../../stores/useAssetPreviewStore'
import { useFlowStore } from '../../../stores/useFlowStore'
import type { CharacterLibNode as CharacterLibNodeType, CharacterLibNodeData } from '../../../types'
import { DEFAULT_NODE_SIZES, resolveNodeWidth } from '../../../utils/nodeSizing'
import NodeWidthResizer from '../NodeWidthResizer'
import NodeTextareaEditor from '../shared/NodeTextareaEditor'
import NodeTitleEditor from '../shared/NodeTitleEditor'
import './style.css'

type TabKey = 'my' | 'official' | 'manual'

const CharacterLibNode = memo(({ id, data, selected = false }: NodeProps<CharacterLibNodeType>) => {
  const updateNodeData = useFlowStore((state) => state.updateNodeData)
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const nodeWidth = resolveNodeWidth(data as Record<string, unknown>, DEFAULT_NODE_SIZES.characterLib.width)

  const [characters, setCharacters] = useState<CharacterItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<TabKey>('my')
  const [officialChars, setOfficialChars] = useState<OfficialCharacterItem[]>([])
  const [officialLoading, setOfficialLoading] = useState(false)
  const [consoleUrl, setConsoleUrl] = useState('')

  const [manualAssetId, setManualAssetId] = useState('')
  const [manualName, setManualName] = useState('')

  const isProcessing = data.status === 'processing' || data.status === 'queued'
  const isDisabled = (data as Record<string, unknown>).disabled === true

  const loadCharacters = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const result = await listCharacters()
      setCharacters(result.characters)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '加载失败')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCharacters()
  }, [loadCharacters])

  const loadOfficial = useCallback(async () => {
    setOfficialLoading(true)
    try {
      const result = await listOfficialCharacters()
      setConsoleUrl(result.console_url)

      // Try to get fresh thumbnails
      let thumbnails: Record<string, string> = {}
      try {
        const thumbResp = await refreshOfficialThumbnails()
        thumbnails = thumbResp.thumbnails
      } catch {
        // thumbnails not available (no IAM creds configured)
      }

      const charsWithThumbs = result.characters.map((c) => ({
        ...c,
        thumbnail: thumbnails[c.asset_id] || c.thumbnail,
      }))
      setOfficialChars(charsWithThumbs)
    } catch {
      // silent
    } finally {
      setOfficialLoading(false)
    }
  }, [])

  const handleSelect = useCallback((char: CharacterItem) => {
    updateNodeData(id, {
      selectedCharacterId: char.id,
      selectedCharacterCdnUrl: char.cdn_url,
      selectedCharacterName: char.name,
      selectedCharacterThumbnail: char.thumbnail_url || char.cdn_url,
    })
  }, [id, updateNodeData])

  const handleOfficialSelect = useCallback((char: OfficialCharacterItem) => {
    const assetUri = `asset://${char.asset_id}`
    updateNodeData(id, {
      selectedCharacterId: char.asset_id,
      selectedCharacterCdnUrl: assetUri,
      selectedCharacterName: char.title,
      selectedCharacterThumbnail: char.thumbnail || '',
    })
    message.info(`已选择官方人像: ${char.title}`)
  }, [id, updateNodeData])

  const handleManualSave = useCallback(() => {
    const trimmedId = manualAssetId.trim()
    if (!trimmedId) {
      message.warning('请输入 Asset ID')
      return
    }
    const name = manualName.trim() || `官方人像 ${trimmedId.slice(0, 12)}`
    const assetUri = trimmedId.startsWith('asset://') ? trimmedId : `asset://${trimmedId}`
    const rawId = trimmedId.replace(/^asset:\/\//, '')

    updateNodeData(id, {
      selectedCharacterId: rawId,
      selectedCharacterCdnUrl: assetUri,
      selectedCharacterName: name,
      selectedCharacterThumbnail: '',
    })
    message.success(`已选择: ${name}`)
    setManualAssetId('')
    setManualName('')
  }, [id, manualAssetId, manualName, updateNodeData])

  const handleDelete = useCallback(async (charId: string) => {
    try {
      await deleteCharacter(charId)
      message.success('已删除')
      if (data.selectedCharacterId === charId) {
        updateNodeData(id, {
          selectedCharacterId: undefined,
          selectedCharacterCdnUrl: undefined,
          selectedCharacterName: undefined,
          selectedCharacterThumbnail: undefined,
        })
      }
      await loadCharacters()
    } catch (error) {
      message.error(error instanceof Error ? error.message : '删除失败')
    }
  }, [id, data.selectedCharacterId, updateNodeData, loadCharacters])

  const handleGenerate = useCallback(async () => {
    const genPrompt = data.genPrompt?.trim()
    if (!genPrompt) {
      message.warning('请输入人物描述')
      return
    }

    updateNodeData(id, { isGenerating: true, status: 'queued', progress: 0, errorMessage: undefined })

    let settled = false

    const closeWs = connectProgress(
      id,
      (progressMessage) => {
        if (settled) return

        if (progressMessage.status === 'processing') {
          updateNodeData(id, { status: 'processing', progress: progressMessage.progress })
          return
        }

        if (progressMessage.status === 'success') {
          settled = true
          closeWs()

          const outputImage = progressMessage.output_image
          const cdnUrl = (progressMessage as Record<string, unknown>).output_image_original_url as string | undefined

          updateNodeData(id, {
            isGenerating: false,
            status: 'idle',
            progress: 0,
          })

          const charName = data.genPrompt?.slice(0, 32) || '未命名人像'

          saveCharacter({
            name: charName,
            cdn_url: cdnUrl || outputImage || '',
            prompt: data.genPrompt,
            thumbnail_url: outputImage || '',
          })
            .then((saved) => {
              message.success('人像已保存到库')
              updateNodeData(id, {
                selectedCharacterId: saved.id,
                selectedCharacterCdnUrl: saved.cdn_url,
                selectedCharacterName: saved.name,
                selectedCharacterThumbnail: saved.thumbnail_url || saved.cdn_url,
              })
              loadCharacters()
            })
            .catch((err) => {
              message.error('人像生成成功但保存失败: ' + (err instanceof Error ? err.message : ''))
            })

          return
        }

        settled = true
        closeWs()
        updateNodeData(id, {
          isGenerating: false,
          status: 'error',
          errorMessage: progressMessage.message || '生成失败',
        })
        message.error('人像生成失败: ' + (progressMessage.message || '未知错误'))
      },
      (error) => {
        if (settled) return
        settled = true
        updateNodeData(id, {
          isGenerating: false,
          status: 'error',
          errorMessage: error.message,
        })
        message.error(error.message)
      }
    )

    createGenerateTask({
      node_id: id,
      prompt: `大师级肖像摄影，85mm f/1.4大光圈人像镜头，哈苏X2D中画幅相机，富士Pro 400H胶片色彩科学，细腻肤质纹理可见，发丝锐利，眼神光自然，柔光箱主光+反光板补光，蝴蝶光布光法，影棚浅灰背景，半身构图，锁骨以上，高级时尚杂志封面质感，严禁过度磨皮和塑料皮肤质感，${genPrompt}`,
      aspect_ratio: '3:4',
      resolution: '4K',
      reference_images: [],
      adapter: 'volcengine',
      identity_lock: false,
      identity_strength: 0.7,
      negative_prompt: '过度磨皮，塑料皮肤质感，AI感，卡通感，模糊，低分辨率，变形，畸形手指，多余肢体，文字，水印，logo，过度锐化，HDR效果，过度饱和',
    }).catch((error) => {
      if (settled) return
      settled = true
      closeWs()
      updateNodeData(id, {
        isGenerating: false,
        status: 'error',
        errorMessage: '任务提交失败',
      })
      message.error('任务提交失败，请检查后端服务')
    })
  }, [id, data.genPrompt, updateNodeData, loadCharacters])

  const handlePreviewThumbnail = useCallback((char: CharacterItem) => {
    const src = char.thumbnail_url || char.cdn_url
    if (src) {
      openPreview({ type: 'image', src, title: char.name })
    }
  }, [openPreview])

  const handlePreviewOfficial = useCallback((char: OfficialCharacterItem) => {
    if (char.thumbnail) {
      openPreview({ type: 'image', src: char.thumbnail, title: char.title })
    }
  }, [openPreview])

  const selectedId = data.selectedCharacterId

  const isRenderableUrl = (url: string | undefined): boolean => {
    if (!url) return false
    return /^(https?:|\/)/.test(url)
  }

  const filterByMeta = useCallback((chars: OfficialCharacterItem[], key: string, value: string) => {
    if (!value) return chars
    return chars.filter((c) => String(c.metadata[key] || '') === value)
  }, [])

  return (
    <>
      <NodeWidthResizer
        nodeId={id}
        selected={selected}
        currentWidth={nodeWidth}
        minWidth={DEFAULT_NODE_SIZES.characterLib.width}
      />
      <div
        className={`character-lib-node status-${data.status}${selected ? ' selected' : ''}${isDisabled ? ' node-disabled' : ''}`}
        style={{ width: nodeWidth }}
      >
        <Handle type="target" position={Position.Left} className="node-handle handle-kind-image" />

        <div className="node-header">
          <TeamOutlined className="node-icon" />
          <NodeTitleEditor
            value={data.label}
            onChange={(value) => updateNodeData(id, { label: value })}
            className="node-title"
            placeholder="输入节点名称"
          />
          {isDisabled && <span className="node-disabled-badge">已禁用</span>}
        </div>

        <div className="node-body nodrag nopan nowheel">
          {/* Selected character display */}
          {selectedId && (
            <div className="selected-character">
              <div className="selected-label">已选人像</div>
              <div className="selected-preview">
                {isRenderableUrl(data.selectedCharacterThumbnail) ? (
                  <img
                    src={data.selectedCharacterThumbnail}
                    alt={data.selectedCharacterName}
                    onClick={() => openPreview({
                      type: 'image',
                      src: data.selectedCharacterThumbnail!,
                      title: data.selectedCharacterName || '人像',
                    })}
                  />
                ) : (
                  <div className="selected-placeholder">
                    <TeamOutlined />
                  </div>
                )}
                <span className="selected-name">{data.selectedCharacterName || '未命名'}</span>
                <span className="selected-uri-type">
                  {data.selectedCharacterCdnUrl?.startsWith('asset://') ? '官方' : '自建'}
                </span>
              </div>
            </div>
          )}

          {/* Tab bar */}
          <Segmented
            block
            size="small"
            value={activeTab}
            onChange={(val) => {
              setActiveTab(val as TabKey)
              if (val === 'official') loadOfficial()
            }}
            options={[
              { label: '我的人像', value: 'my' },
              { label: '官方人像', value: 'official' },
              { label: '手动添加', value: 'manual' },
            ]}
            className="lib-tab-bar"
          />

          {/* ── My tab ── */}
          {activeTab === 'my' && (
            <>
              <div className="generate-section">
                <div className="section-label">生成新人像</div>
                <NodeTextareaEditor
                  variant="native"
                  className="gen-prompt-textarea nodrag"
                  value={data.genPrompt}
                  onCommit={(value) => updateNodeData(id, { genPrompt: value })}
                  placeholder="描述人物特征，例如：年轻女性，长发，温柔眼神..."
                  rows={2}
                />
                <Button
                  type="primary"
                  block
                  size="small"
                  onClick={handleGenerate}
                  loading={data.isGenerating}
                  disabled={isDisabled || data.isGenerating}
                  icon={<PlusOutlined />}
                  className="generate-btn nodrag"
                >
                  {data.isGenerating ? '生成中...' : '生成人像'}
                </Button>

                {isProcessing && (
                  <div className="progress-bar">
                    <Progress percent={data.progress} size="small" status="active" strokeColor="#1677ff" />
                  </div>
                )}

                {data.status === 'error' && data.errorMessage && (
                  <div className="error-message">{data.errorMessage}</div>
                )}
              </div>

              <div className="gallery-section">
                <div className="section-label">
                  人像库
                  <button
                    type="button"
                    className="gallery-refresh-btn nodrag"
                    onClick={loadCharacters}
                    title="刷新列表"
                  >
                    ↻
                  </button>
                </div>

                {isLoading && (
                  <div className="gallery-loading">
                    <Spin size="small" /> 加载中...
                  </div>
                )}

                {loadError && (
                  <div className="gallery-error">{loadError}</div>
                )}

                {!isLoading && !loadError && characters.length === 0 && (
                  <div className="gallery-empty">暂无保存的人像，生成新人像将自动存入</div>
                )}

                {!isLoading && characters.length > 0 && (
                  <div className="gallery-grid">
                    {characters.map((char) => (
                      <div
                        key={char.id}
                        className={`gallery-item${selectedId === char.id ? ' is-selected' : ''}`}
                        onClick={() => handleSelect(char)}
                      >
                        <img
                          src={char.thumbnail_url || char.cdn_url}
                          alt={char.name}
                          className="gallery-thumb"
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePreviewThumbnail(char)
                          }}
                        />
                        <div className="gallery-item-name" title={char.name}>{char.name}</div>
                        <button
                          type="button"
                          className="gallery-delete-btn nodrag"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(char.id)
                          }}
                          title="删除此人物"
                        >
                          <DeleteOutlined />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── Official tab ── */}
          {activeTab === 'official' && (
            <div className="official-section">
              <div className="official-header">
                <span className="section-label">官方虚拟人像库 ({officialChars.length} 个预置)</span>
                <a
                  href={consoleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="official-console-link nodrag"
                  title="前往火山引擎控制台浏览更多人像"
                >
                  <LinkOutlined /> 更多
                </a>
              </div>

              <div className="official-hint">
                预置精选人像，点击选择后输出 asset:// URI 给下游视频生成节点。
                需要更多人像？前往
                <a href={consoleUrl} target="_blank" rel="noopener noreferrer">火山控制台</a>
                浏览 6000+ 人像，复制 Asset ID 后在「手动添加」tab 中使用。
              </div>

              {officialLoading && (
                <div className="gallery-loading">
                  <Spin size="small" /> 加载中...
                </div>
              )}

              {!officialLoading && officialChars.length > 0 && (
                <div className="gallery-grid official-grid">
                  {officialChars.map((char) => (
                    <div
                      key={char.asset_id}
                      className={`gallery-item official-item${selectedId === char.asset_id ? ' is-selected' : ''}`}
                      onClick={() => handleOfficialSelect(char)}
                    >
                      {isRenderableUrl(char.thumbnail) ? (
                        <img
                          src={char.thumbnail}
                          alt={char.title}
                          className="gallery-thumb"
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePreviewOfficial(char)
                          }}
                        />
                      ) : (
                        <div className="gallery-thumb official-thumb-placeholder">
                          <TeamOutlined />
                        </div>
                      )}
                      <div className="gallery-item-name" title={char.title}>{char.title}</div>
                      <div className="gallery-item-meta">
                        {char.metadata.Country && `${char.metadata.Country} · `}
                        {char.metadata.Age && `${char.metadata.Age}岁`}
                        {char.metadata.Gender && ` · ${char.metadata.Gender}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Manual tab ── */}
          {activeTab === 'manual' && (
            <div className="manual-section">
              <div className="section-label">手动添加官方人像</div>
              <div className="manual-hint">
                在
                <a href={consoleUrl || 'https://console.volcengine.com/ark/region:ark.cn-beijing/experience/portrait'} target="_blank" rel="noopener noreferrer">火山引擎体验中心</a>
                浏览人像库，复制 Asset ID 粘贴到下方即可使用。
              </div>

              <div className="manual-field">
                <label className="manual-label">Asset ID</label>
                <Input
                  className="nodrag"
                  placeholder="例如: asset-20260401123823-6d4x2"
                  value={manualAssetId}
                  onChange={(e) => setManualAssetId(e.target.value)}
                  allowClear
                  size="small"
                />
              </div>

              <div className="manual-field">
                <label className="manual-label">备注名称（可选）</label>
                <Input
                  className="nodrag"
                  placeholder="给这个人像一个好记的名字"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  allowClear
                  size="small"
                />
              </div>

              <Button
                type="primary"
                block
                size="small"
                onClick={handleManualSave}
                disabled={!manualAssetId.trim()}
                icon={<PlusOutlined />}
                className="nodrag"
              >
                使用此人像
              </Button>
            </div>
          )}
        </div>

        <Handle type="source" position={Position.Right} className="node-handle handle-kind-image" />
      </div>
    </>
  )
})

CharacterLibNode.displayName = 'CharacterLibNode'

export default CharacterLibNode
