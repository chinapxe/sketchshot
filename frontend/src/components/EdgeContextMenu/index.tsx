import { memo, useCallback, useEffect, useRef } from 'react'
import { DeleteOutlined } from '@ant-design/icons'

import { useFlowStore } from '../../stores/useFlowStore'
import '../ContextMenu/style.css'

export interface EdgeContextMenuProps {
  edgeId: string
  x: number
  y: number
  onClose: () => void
}

const EdgeContextMenu = memo(({ edgeId, x, y, onClose }: EdgeContextMenuProps) => {
  const deleteEdge = useFlowStore((state) => state.deleteEdge)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as HTMLElement)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleDelete = useCallback(() => {
    deleteEdge(edgeId)
    onClose()
  }, [deleteEdge, edgeId, onClose])

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
    >
      <div className="context-menu-item danger" onClick={handleDelete}>
        <DeleteOutlined className="menu-item-icon" />
        <span>删除连线</span>
      </div>
    </div>
  )
})

EdgeContextMenu.displayName = 'EdgeContextMenu'

export default EdgeContextMenu
