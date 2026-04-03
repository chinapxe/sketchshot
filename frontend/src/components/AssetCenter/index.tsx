import { memo, useMemo, useState } from 'react'
import { Button, Empty, Modal, Segmented, Tag } from 'antd'

import { useAssetPreviewStore } from '../../stores/useAssetPreviewStore'
import type { AppNode } from '../../types'
import { getAssetCenterEntries } from '../../utils/assetCenter'
import './style.css'

interface AssetCenterProps {
  open: boolean
  nodes: AppNode[]
  onClose: () => void
}

type AssetFilter = 'all' | 'image' | 'video' | 'upload' | 'generated'

function getCategoryLabel(category: 'upload' | 'reference' | 'generated'): string {
  switch (category) {
    case 'upload':
      return '上传'
    case 'reference':
      return '参考'
    default:
      return '生成'
  }
}

function getNodeTypeLabel(nodeType: AppNode['type']): string {
  switch (nodeType) {
    case 'shot':
      return '镜头'
    case 'character':
      return '角色'
    case 'imageUpload':
      return '上传'
    case 'imageGen':
      return '图片节点'
    case 'videoGen':
      return '视频节点'
    default:
      return nodeType
  }
}

const AssetCenter = memo(({ open, nodes, onClose }: AssetCenterProps) => {
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const [filter, setFilter] = useState<AssetFilter>('all')
  const entries = useMemo(() => getAssetCenterEntries(nodes), [nodes])

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (filter === 'all') return true
      if (filter === 'image') return entry.assetType === 'image'
      if (filter === 'video') return entry.assetType === 'video'
      if (filter === 'upload') return entry.category === 'upload'
      return entry.category === 'generated'
    })
  }, [entries, filter])

  const summary = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        acc.total += 1
        if (entry.assetType === 'image') acc.images += 1
        if (entry.assetType === 'video') acc.videos += 1
        if (entry.category === 'upload') acc.uploads += 1
        if (entry.category === 'generated') acc.generated += 1
        return acc
      },
      { total: 0, images: 0, videos: 0, uploads: 0, generated: 0 }
    )
  }, [entries])

  return (
    <Modal
      open={open}
      title="资产中心"
      onCancel={onClose}
      footer={null}
      width={920}
      destroyOnHidden
    >
      <div className="asset-center-summary">
        <span className="asset-center-chip">总资产 {summary.total}</span>
        <span className="asset-center-chip">图片 {summary.images}</span>
        <span className="asset-center-chip">视频 {summary.videos}</span>
        <span className="asset-center-chip upload">上传 {summary.uploads}</span>
        <span className="asset-center-chip generated">生成 {summary.generated}</span>
      </div>

      <Segmented
        block
        value={filter}
        onChange={(value) => setFilter(value as AssetFilter)}
        options={[
          { label: '全部', value: 'all' },
          { label: '图片', value: 'image' },
          { label: '视频', value: 'video' },
          { label: '上传', value: 'upload' },
          { label: '生成', value: 'generated' },
        ]}
        className="asset-center-filter"
      />

      <div className="asset-center-list">
        {filteredEntries.length === 0 ? (
          <Empty description="当前筛选条件下没有资产" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          filteredEntries.map((entry) => (
            <div key={entry.key} className="asset-center-item">
              <div className="asset-center-preview">
                {entry.assetType === 'video' ? (
                  <video className="asset-center-media" src={entry.url} muted playsInline />
                ) : (
                  <img className="asset-center-media" src={entry.url} alt={entry.title} />
                )}
              </div>

              <div className="asset-center-main">
                <div className="asset-center-title-row">
                  <div className="asset-center-title">{entry.title}</div>
                  <div className="asset-center-tags">
                    <Tag>{entry.assetType === 'video' ? '视频' : '图片'}</Tag>
                    <Tag color={entry.category === 'generated' ? 'success' : entry.category === 'upload' ? 'blue' : 'default'}>
                      {getCategoryLabel(entry.category)}
                    </Tag>
                  </div>
                </div>

                <div className="asset-center-url">{entry.url}</div>

                <div className="asset-center-source-list">
                  {entry.sources.map((source) => (
                    <div key={`${source.nodeId}-${source.relation}`} className="asset-center-source-item">
                      <span className="asset-center-source-node">{getNodeTypeLabel(source.nodeType)} · {source.nodeLabel}</span>
                      <span className="asset-center-source-relation">{source.relation}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="asset-center-actions">
                <Button
                  size="small"
                  onClick={() =>
                    openPreview({
                      type: entry.assetType,
                      src: entry.url,
                      title: entry.title,
                    })
                  }
                >
                  预览
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  )
})

AssetCenter.displayName = 'AssetCenter'

export default AssetCenter
