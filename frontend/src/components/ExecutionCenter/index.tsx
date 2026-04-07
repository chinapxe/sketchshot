import { memo, useMemo } from 'react'
import { Button, Empty, Modal, Progress, Tag } from 'antd'

import { useAssetPreviewStore } from '../../stores/useAssetPreviewStore'
import type { AppEdge, AppNode } from '../../types'
import { getExecutionCenterEntriesWithEdges } from '../../utils/executionCenter'
import './style.css'

interface ExecutionCenterProps {
  open: boolean
  nodes: AppNode[]
  edges: AppEdge[]
  onClose: () => void
  onOpenVersionCompare?: (nodeId: string) => void
}

function getStatusMeta(status: string): { label: string; color: string } {
  switch (status) {
    case 'success':
      return { label: '成功', color: 'success' }
    case 'processing':
      return { label: '执行中', color: 'processing' }
    case 'queued':
      return { label: '排队中', color: 'warning' }
    case 'error':
      return { label: '失败', color: 'error' }
    default:
      return { label: '未执行', color: 'default' }
  }
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

const ExecutionCenter = memo(({ open, nodes, edges, onClose, onOpenVersionCompare }: ExecutionCenterProps) => {
  const openPreview = useAssetPreviewStore((state) => state.openPreview)
  const entries = useMemo(() => getExecutionCenterEntriesWithEdges(nodes, edges), [edges, nodes])

  const summary = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        acc.total += 1
        if (entry.status === 'success') acc.success += 1
        if (entry.status === 'processing' || entry.status === 'queued') acc.running += 1
        if (entry.status === 'error') acc.error += 1
        return acc
      },
      { total: 0, success: 0, running: 0, error: 0 }
    )
  }, [entries])

  return (
    <Modal
      open={open}
      title="执行中心"
      onCancel={onClose}
      footer={null}
      width={780}
      destroyOnHidden
    >
      <div className="execution-center-summary">
        <span className="execution-summary-chip">总节点 {summary.total}</span>
        <span className="execution-summary-chip success">成功 {summary.success}</span>
        <span className="execution-summary-chip running">执行中 {summary.running}</span>
        <span className="execution-summary-chip error">失败 {summary.error}</span>
      </div>

      <div className="execution-center-list">
        {entries.length === 0 ? (
          <Empty description="当前画布里还没有可执行的生成节点" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          entries.map((entry) => {
            const statusMeta = getStatusMeta(entry.status)

            return (
              <div key={entry.id} className={`execution-center-item${entry.disabled ? ' disabled' : ''}`}>
                <div className="execution-center-main">
                  <div className="execution-center-title-row">
                    <div className="execution-center-title">{entry.title}</div>
                    <div className="execution-center-tags">
                      <Tag>{getNodeTypeLabel(entry.nodeType)}</Tag>
                      <Tag color={statusMeta.color}>{statusMeta.label}</Tag>
                      {entry.sequenceLabel && entry.sequenceStep && entry.sequenceLength && (
                        <Tag color="blue">{`${entry.sequenceLabel} · ${entry.sequenceStep}/${entry.sequenceLength}`}</Tag>
                      )}
                      {entry.versionCount > 1 && <Tag color="gold">{`版本 ${entry.versionCount}`}</Tag>}
                      {entry.disabled && <Tag>已禁用</Tag>}
                    </div>
                  </div>

                  <div className="execution-center-subtitle">{entry.subtitle}</div>

                  {(entry.status === 'processing' || entry.status === 'queued') && (
                    <Progress
                      percent={entry.progress}
                      size="small"
                      status={entry.status === 'queued' ? 'normal' : 'active'}
                      className="execution-center-progress"
                    />
                  )}

                  {entry.errorMessage && (
                    <div className="execution-center-error">{entry.errorMessage}</div>
                  )}
                </div>

                <div className="execution-center-actions">
                  {entry.versionCount > 1 && (
                    <Button
                      size="small"
                      onClick={() => onOpenVersionCompare?.(entry.id)}
                    >
                      版本对比
                    </Button>
                  )}
                  <Button
                    size="small"
                    disabled={!entry.assetUrl || !entry.assetType}
                    onClick={() => {
                      if (!entry.assetUrl || !entry.assetType) return
                      openPreview({
                        type: entry.assetType,
                        src: entry.assetUrl,
                        title: entry.title,
                      })
                    }}
                  >
                    {entry.assetUrl && entry.assetType ? '预览结果' : '暂无结果'}
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </Modal>
  )
})

ExecutionCenter.displayName = 'ExecutionCenter'

export default ExecutionCenter
