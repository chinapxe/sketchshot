import { memo, useEffect, useMemo, useState } from 'react'
import { Button, Empty, Modal, Tag } from 'antd'

import { useAssetPreviewStore } from '../../stores/useAssetPreviewStore'
import type { AppEdge, AppNode } from '../../types'
import { getVersionCompareEntries } from '../../utils/versionCompare'
import './style.css'

interface VersionCompareProps {
  open: boolean
  nodes: AppNode[]
  edges: AppEdge[]
  initialNodeId?: string | null
  onClose: () => void
}

function getNodeTypeLabel(nodeType: AppNode['type']): string {
  switch (nodeType) {
    case 'shot':
      return '镜头'
    case 'imageGen':
      return '图片生成'
    case 'threeViewGen':
      return '三视图生成'
    case 'continuity':
      return '九宫格动作'
    case 'videoGen':
      return '视频生成'
    default:
      return nodeType
  }
}

const VersionCompare = memo(({ open, nodes, edges, initialNodeId, onClose }: VersionCompareProps) => {
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const entries = useMemo(() => getVersionCompareEntries(nodes, edges), [edges, nodes])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(initialNodeId ?? null)

  useEffect(() => {
    if (!open) {
      return
    }

    if (initialNodeId && entries.some((entry) => entry.nodeId === initialNodeId)) {
      setSelectedNodeId(initialNodeId)
      return
    }

    setSelectedNodeId(entries[0]?.nodeId ?? null)
  }, [entries, initialNodeId, open])

  const selectedEntry = entries.find((entry) => entry.nodeId === selectedNodeId) ?? null

  return (
    <Modal
      open={open}
      title="版本对比"
      onCancel={onClose}
      footer={null}
      width={1080}
      destroyOnHidden
    >
      {entries.length === 0 ? (
        <Empty description="当前还没有多版本结果可对比" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <div className="version-compare-layout">
          <div className="version-compare-sidebar">
            <div className="version-compare-summary">
              <span className="version-compare-chip">可比较节点 {entries.length}</span>
              <span className="version-compare-chip">总版本 {entries.reduce((acc, entry) => acc + entry.versions.length, 0)}</span>
            </div>

            <div className="version-compare-node-list">
              {entries.map((entry) => (
                <button
                  key={entry.nodeId}
                  type="button"
                  className={`version-compare-node-item${entry.nodeId === selectedNodeId ? ' is-active' : ''}`}
                  onClick={() => setSelectedNodeId(entry.nodeId)}
                >
                  <div className="version-compare-node-title-row">
                    <div className="version-compare-node-title">{entry.title}</div>
                    <Tag>{entry.versions.length} 个版本</Tag>
                  </div>
                  <div className="version-compare-node-subtitle">{entry.subtitle}</div>
                  <div className="version-compare-node-tags">
                    <Tag>{getNodeTypeLabel(entry.nodeType)}</Tag>
                    {entry.sequenceLabel && entry.sequenceStep && entry.sequenceLength && (
                      <Tag color="blue">{`${entry.sequenceLabel} · ${entry.sequenceStep}/${entry.sequenceLength}`}</Tag>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="version-compare-main">
            {!selectedEntry ? (
              <Empty description="请选择一个节点，查看不同生成版本的差异" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <>
                <div className="version-compare-main-header">
                  <div>
                    <div className="version-compare-main-title">{selectedEntry.title}</div>
                    <div className="version-compare-main-subtitle">{selectedEntry.subtitle}</div>
                  </div>
                  <div className="version-compare-main-tags">
                    <Tag>{getNodeTypeLabel(selectedEntry.nodeType)}</Tag>
                    <Tag>{selectedEntry.assetType === 'video' ? '视频' : '图片'}</Tag>
                    {selectedEntry.sequenceLabel && selectedEntry.sequenceStep && selectedEntry.sequenceLength && (
                      <Tag color="blue">{`${selectedEntry.sequenceLabel} · ${selectedEntry.sequenceStep}/${selectedEntry.sequenceLength}`}</Tag>
                    )}
                  </div>
                </div>

                <div className="version-compare-grid">
                  {selectedEntry.versions.map((version) => (
                    <div key={version.key} className="version-compare-card">
                      <div className="version-compare-card-preview">
                        {selectedEntry.assetType === 'video' ? (
                          <video className="version-compare-card-media" src={version.url} muted playsInline />
                        ) : (
                          <img className="version-compare-card-media" src={version.url} alt={version.label} />
                        )}
                      </div>

                      <div className="version-compare-card-body">
                        <div className="version-compare-card-title-row">
                          <div className="version-compare-card-title">{version.label}</div>
                          {version.isCurrent && <Tag color="success">当前使用</Tag>}
                        </div>
                        <div className="version-compare-card-url">{version.url}</div>
                        <Button
                          size="small"
                          onClick={() =>
                            openPreview({
                              type: selectedEntry.assetType,
                              src: version.url,
                              title: `${selectedEntry.title} - ${version.label}`,
                            })
                          }
                        >
                          查看预览
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
})

VersionCompare.displayName = 'VersionCompare'

export default VersionCompare
