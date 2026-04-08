/**
 * 节点右键上下文菜单
 * 支持克隆、删除、禁用/启用节点
 */
import { memo, useCallback, useEffect, useRef } from 'react'
import {
  CopyOutlined,
  DeleteOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons'
import { useFlowStore } from '../../stores/useFlowStore'
import './style.css'

export interface ContextMenuProps {
  /** 目标节点 ID */
  nodeId: string
  /** 菜单显示位置 */
  x: number
  y: number
  /** 节点是否被禁用 */
  isDisabled: boolean
  /** 关闭菜单回调 */
  onClose: () => void
}

const ContextMenu = memo(({ nodeId, x, y, isDisabled, onClose }: ContextMenuProps) => {
  const cloneNode = useFlowStore((s) => s.cloneNode)
  const deleteNode = useFlowStore((s) => s.deleteNode)
  const toggleNodeDisabled = useFlowStore((s) => s.toggleNodeDisabled)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击菜单外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleClone = useCallback(() => {
    console.log(`[右键菜单] 克隆节点: ${nodeId}`)
    cloneNode(nodeId)
    onClose()
  }, [nodeId, cloneNode, onClose])

  const handleDelete = useCallback(() => {
    console.log(`[右键菜单] 删除节点: ${nodeId}`)
    deleteNode(nodeId)
    onClose()
  }, [nodeId, deleteNode, onClose])

  const handleToggleDisabled = useCallback(() => {
    console.log(`[右键菜单] ${isDisabled ? '启用' : '禁用'}节点: ${nodeId}`)
    toggleNodeDisabled(nodeId)
    onClose()
  }, [nodeId, isDisabled, toggleNodeDisabled, onClose])

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ left: x, top: y }}
    >
      <div className="context-menu-item" onClick={handleClone}>
        <CopyOutlined className="menu-item-icon" />
        <span>克隆节点</span>
      </div>
      <div className="context-menu-item" onClick={handleToggleDisabled}>
        {isDisabled ? (
          <>
            <CheckCircleOutlined className="menu-item-icon text-green" />
            <span>启用节点</span>
          </>
        ) : (
          <>
            <StopOutlined className="menu-item-icon text-orange" />
            <span>禁用节点</span>
          </>
        )}
      </div>
      <div className="context-menu-divider" />
      <div className="context-menu-item danger" onClick={handleDelete}>
        <DeleteOutlined className="menu-item-icon" />
        <span>删除节点</span>
      </div>
    </div>
  )
})

ContextMenu.displayName = 'ContextMenu'
export default ContextMenu

