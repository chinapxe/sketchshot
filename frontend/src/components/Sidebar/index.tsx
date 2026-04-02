import { memo } from 'react'
import {
  AppstoreOutlined,
  BgColorsOutlined,
  BranchesOutlined,
  CameraOutlined,
  HighlightOutlined,
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
  const onDragStart = (event: React.DragEvent, nodeType: AppNodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="sidebar">
      <div className="sidebar-title">节点库</div>
      <div className="sidebar-list">
        {nodeTypes.map((item) => (
          <div
            key={item.type}
            className="sidebar-item"
            draggable
            onDragStart={(event) => onDragStart(event, item.type)}
          >
            <div className="sidebar-item-icon">{item.icon}</div>
            <div className="sidebar-item-info">
              <div className="sidebar-item-label">{item.label}</div>
              <div className="sidebar-item-desc">{item.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

Sidebar.displayName = 'Sidebar'

export default Sidebar
