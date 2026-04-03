import { memo, useEffect, useState } from 'react'
import {
  AppstoreOutlined,
  BgColorsOutlined,
  BranchesOutlined,
  CameraOutlined,
  HighlightOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PictureOutlined,
  PlaySquareOutlined,
  TeamOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'

import type { AppNodeType } from '../../types'
import './style.css'

interface NodeTypeItem {
  type: AppNodeType
  label: string
  description: string
  icon: React.ReactNode
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'sketchshot-sidebar-collapsed'

const nodeTypes: NodeTypeItem[] = [
  {
    type: 'scene',
    label: '场次',
    description: '组织剧情段落和镜头组',
    icon: <BranchesOutlined />,
  },
  {
    type: 'shot',
    label: '镜头',
    description: '故事板核心镜头，可直接生成',
    icon: <CameraOutlined />,
  },
  {
    type: 'character',
    label: '角色',
    description: '定义可复用的人物设定',
    icon: <TeamOutlined />,
  },
  {
    type: 'style',
    label: '风格',
    description: '统一视觉氛围与镜头语言',
    icon: <BgColorsOutlined />,
  },
  {
    type: 'imageUpload',
    label: '图片上传',
    description: '上传参考图或起始图',
    icon: <PictureOutlined />,
  },
  {
    type: 'imageGen',
    label: '图片生成',
    description: '生成静态图像结果',
    icon: <HighlightOutlined />,
  },
  {
    type: 'imageDisplay',
    label: '图片预览',
    description: '查看生成出的图像',
    icon: <AppstoreOutlined />,
  },
  {
    type: 'videoGen',
    label: '视频生成',
    description: '基于上游图片生成动态片段',
    icon: <VideoCameraOutlined />,
  },
  {
    type: 'videoDisplay',
    label: '视频预览',
    description: '查看生成出的视频片段',
    icon: <PlaySquareOutlined />,
  },
]

const Sidebar = memo(() => {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === '1'
  })

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, isCollapsed ? '1' : '0')
  }, [isCollapsed])

  const onDragStart = (event: React.DragEvent, nodeType: AppNodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside className={`sidebar${isCollapsed ? ' is-collapsed' : ''}`}>
      <div className="sidebar-header">
        {!isCollapsed && <div className="sidebar-title">节点库</div>}
        <button
          type="button"
          className="sidebar-toggle"
          onClick={() => setIsCollapsed((value) => !value)}
          aria-label={isCollapsed ? '展开节点栏' : '收起节点栏'}
          title={isCollapsed ? '展开节点栏' : '收起节点栏'}
        >
          {isCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
        </button>
      </div>

      <div className="sidebar-list">
        {nodeTypes.map((item) => (
          <div
            key={item.type}
            className="sidebar-item"
            draggable
            onDragStart={(event) => onDragStart(event, item.type)}
            title={isCollapsed ? `${item.label}：${item.description}` : undefined}
          >
            <div className="sidebar-item-icon">{item.icon}</div>
            {!isCollapsed && (
              <div className="sidebar-item-info">
                <div className="sidebar-item-label">{item.label}</div>
                <div className="sidebar-item-desc">{item.description}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  )
})

Sidebar.displayName = 'Sidebar'

export default Sidebar
