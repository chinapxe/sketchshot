import { memo } from 'react'
import { Modal } from 'antd'
import { useAssetPreviewStore } from '../../stores/useAssetPreviewStore'
import './style.css'

const AssetPreviewModal = memo(() => {
  const isOpen = useAssetPreviewStore((state) => state.isOpen)
  const asset = useAssetPreviewStore((state) => state.asset)
  const closePreview = useAssetPreviewStore((state) => state.closePreview)

  return (
    <Modal
      open={isOpen}
      title={asset?.title ?? '资源预览'}
      footer={null}
      onCancel={closePreview}
      width="min(92vw, 1080px)"
      centered
      destroyOnClose
      className="asset-preview-modal"
    >
      <div className="asset-preview-body">
        {asset?.type === 'video' ? (
          <video className="asset-preview-media" src={asset.src} controls autoPlay />
        ) : asset?.src ? (
          <img className="asset-preview-media" src={asset.src} alt={asset.title ?? '预览资源'} />
        ) : null}
      </div>
    </Modal>
  )
})

AssetPreviewModal.displayName = 'AssetPreviewModal'
export default AssetPreviewModal
