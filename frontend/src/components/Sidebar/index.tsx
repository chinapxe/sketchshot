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
    label: 'Scene',
    description: 'Organize story beats and shot groups',
    icon: <BranchesOutlined />,
  },
  {
    type: 'shot',
    label: 'Shot',
    description: 'Create a storyboard shot and generate directly',
    icon: <CameraOutlined />,
  },
  {
    type: 'character',
    label: 'Character',
    description: 'Define a reusable character profile',
    icon: <TeamOutlined />,
  },
  {
    type: 'style',
    label: 'Style',
    description: 'Define the visual tone and framing language',
    icon: <BgColorsOutlined />,
  },
  {
    type: 'imageUpload',
    label: 'Image',
    description: 'Upload a source image',
    icon: <PictureOutlined />,
  },
  {
    type: 'imageGen',
    label: 'Image Gen',
    description: 'Generate a still image',
    icon: <HighlightOutlined />,
  },
  {
    type: 'imageDisplay',
    label: 'Image Output',
    description: 'Preview generated images',
    icon: <AppstoreOutlined />,
  },
  {
    type: 'videoGen',
    label: 'Video Motion',
    description: 'Turn upstream images into a motion clip',
    icon: <VideoCameraOutlined />,
  },
  {
    type: 'videoDisplay',
    label: 'Video Output',
    description: 'Preview generated motion clips',
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
      <div className="sidebar-title">Node Library</div>
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
