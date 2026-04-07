import { memo, useEffect, useRef, type ReactNode } from 'react'
import {
  AppstoreOutlined,
  BgColorsOutlined,
  BorderOutlined,
  BranchesOutlined,
  CameraOutlined,
  HighlightOutlined,
  PictureOutlined,
  PlaySquareOutlined,
  TeamOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'

import type { AppNodeType } from '../../types'
import { getHandleToneKind, NODE_CATALOG } from '../../utils/flowConnections'
import './style.css'

export interface QuickConnectMenuProps {
  x: number
  y: number
  targetTypes: AppNodeType[]
  onSelect: (type: AppNodeType) => void
  onClose: () => void
}

const NODE_TYPE_ICONS: Record<AppNodeType, ReactNode> = {
  scene: <BranchesOutlined />,
  shot: <CameraOutlined />,
  character: <TeamOutlined />,
  style: <BgColorsOutlined />,
  continuity: <BorderOutlined />,
  imageUpload: <PictureOutlined />,
  imageGen: <HighlightOutlined />,
  threeViewGen: <AppstoreOutlined />,
  imageDisplay: <AppstoreOutlined />,
  videoGen: <VideoCameraOutlined />,
  videoDisplay: <PlaySquareOutlined />,
}

const QuickConnectMenu = memo(({ x, y, targetTypes, onSelect, onClose }: QuickConnectMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div ref={menuRef} className="quick-connect-menu" style={{ left: x, top: y }} role="menu">
      <div className="quick-connect-menu-header">
        <div className="quick-connect-menu-title">快速创建并连线</div>
        <div className="quick-connect-menu-subtitle">只展示当前可合法连接的节点</div>
      </div>

      <div className="quick-connect-menu-list">
        {targetTypes.map((type) => {
          const catalog = NODE_CATALOG[type]
          const toneKind = getHandleToneKind(type, 'target')

          return (
            <button
              key={type}
              type="button"
              className="quick-connect-menu-item"
              onClick={() => onSelect(type)}
              role="menuitem"
            >
              <span className={`quick-connect-menu-dot handle-kind-${toneKind}`} aria-hidden="true" />
              <span className="quick-connect-menu-icon" aria-hidden="true">
                {NODE_TYPE_ICONS[type]}
              </span>
              <span className="quick-connect-menu-content">
                <span className="quick-connect-menu-label">{catalog.label}</span>
                <span className="quick-connect-menu-description">{catalog.description}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
})

QuickConnectMenu.displayName = 'QuickConnectMenu'

export default QuickConnectMenu
