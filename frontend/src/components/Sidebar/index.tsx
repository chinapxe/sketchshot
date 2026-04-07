import { memo, useEffect, useState } from 'react'
import {
  AppstoreOutlined,
  BgColorsOutlined,
  BorderOutlined,
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

import type { AppNodeType, NodeCreationData, NodeCreationPayload } from '../../types'
import './style.css'

interface NodeTypeItem {
  type: AppNodeType
  label: string
  description: string
  icon: React.ReactNode
  data?: NodeCreationData
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'sketchshot-sidebar-collapsed'
const SHOW_PRESET_NODE_SECTION = false

const BrandLogo = memo(() => (
  <svg className="sidebar-brand-logo" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="sidebar-brand-gradient" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
        <stop stopColor="#162033" />
        <stop offset="1" stopColor="#385272" />
      </linearGradient>
      <linearGradient id="sidebar-brand-accent" x1="16" y1="14" x2="32" y2="34" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F4C978" />
        <stop offset="1" stopColor="#D78D2D" />
      </linearGradient>
    </defs>
    <rect x="4" y="4" width="40" height="40" rx="13" fill="url(#sidebar-brand-gradient)" />
    <rect x="12" y="12" width="24" height="24" rx="8" stroke="rgba(255,255,255,0.26)" strokeWidth="1.5" />
    <circle cx="24" cy="24" r="7.5" fill="url(#sidebar-brand-accent)" />
    <circle cx="24" cy="24" r="3.5" fill="#FFF7E8" />
    <path d="M32.5 14.5L35 12" stroke="#F7D79A" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M14 33.5L18 29.5" stroke="#9EC5FF" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
))

BrandLogo.displayName = 'BrandLogo'

const basicNodeTypes: NodeTypeItem[] = [
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
    type: 'continuity',
    label: '九宫格动作',
    description: '拆解视频镜头的 9 格连续动作',
    icon: <BorderOutlined />,
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
    type: 'threeViewGen',
    label: '三视图生成',
    description: '根据参考图生成角色三视图拼板',
    icon: <AppstoreOutlined />,
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

const presetNodeTypes: NodeTypeItem[] = [
  {
    type: 'imageUpload',
    label: '角色参考图',
    description: '常用预设，直接作为角色参考上传位',
    icon: <PictureOutlined />,
    data: {
      label: '角色参考图',
    },
  },
  {
    type: 'imageGen',
    label: '主角定妆图',
    description: '预设 3:4 角色定妆出图节点',
    icon: <HighlightOutlined />,
    data: {
      label: '主角定妆图',
      prompt: '电影感肖像，柔和主光，肤质细节丰富，锐利对焦',
      aspectRatio: '3:4',
    },
  },
  {
    type: 'imageUpload',
    label: '关键帧上传',
    description: '给视频节点提供关键帧参考',
    icon: <PictureOutlined />,
    data: {
      label: '关键帧上传',
    },
  },
  {
    type: 'videoGen',
    label: '动态片段',
    description: '常用视频片段生成节点',
    icon: <VideoCameraOutlined />,
    data: {
      label: '动态片段',
      prompt: '镜头微动，主体动作自然，保持角色和场景连续性',
      aspectRatio: '16:9',
      durationSeconds: 4,
      motionStrength: 0.6,
    },
  },
  {
    type: 'imageUpload',
    label: '首帧参考上传',
    description: '给首尾帧视频流程提供首帧参考',
    icon: <PictureOutlined />,
    data: {
      label: '首帧参考上传',
    },
  },
  {
    type: 'imageUpload',
    label: '尾帧参考上传',
    description: '给首尾帧视频流程提供尾帧参考',
    icon: <PictureOutlined />,
    data: {
      label: '尾帧参考上传',
    },
  },
  {
    type: 'imageUpload',
    label: '正面参考上传',
    description: '给角色节点提供正面视角参考',
    icon: <PictureOutlined />,
    data: {
      label: '正面参考上传',
    },
  },
  {
    type: 'imageUpload',
    label: '侧面参考上传',
    description: '给角色节点提供侧面视角参考',
    icon: <PictureOutlined />,
    data: {
      label: '侧面参考上传',
    },
  },
  {
    type: 'imageUpload',
    label: '背面参考上传',
    description: '给角色节点提供背面视角参考',
    icon: <PictureOutlined />,
    data: {
      label: '背面参考上传',
    },
  },
]

const nodeSections: Array<{ key: string; title: string; items: NodeTypeItem[] }> = [
  { key: 'basic', title: '基础节点', items: basicNodeTypes },
  { key: 'preset', title: '常用预设', items: presetNodeTypes },
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

  const onDragStart = (event: React.DragEvent, item: NodeTypeItem) => {
    const payload: NodeCreationPayload = {
      type: item.type,
      data: item.data,
    }

    event.dataTransfer.setData('application/reactflow', item.type)
    event.dataTransfer.setData('application/sketchshot-node', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <aside className={`sidebar${isCollapsed ? ' is-collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            <BrandLogo />
          </div>
          {!isCollapsed && (
            <div className="sidebar-brand-copy">
              <div className="sidebar-brand-title-row">
                <span className="sidebar-brand-title-zh">镜语</span>
                <span className="sidebar-brand-title-en">SketchShot</span>
              </div>
              <div className="sidebar-brand-subtitle">诗寻静语应无极，梦绕闲云未有涯</div>
            </div>
          )}
        </div>
        {!isCollapsed && <div className="sidebar-title">镜语 SketchShot</div>}
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
        {nodeSections
          .filter((section) => SHOW_PRESET_NODE_SECTION || section.key !== 'preset')
          .map((section) => (
          <div key={section.key} className="sidebar-section">
            {!isCollapsed && <div className="sidebar-section-title">{section.title}</div>}
            <div className="sidebar-section-items">
              {section.items.map((item) => (
                <div
                  key={`${section.key}-${item.label}`}
                  className="sidebar-item"
                  draggable
                  onDragStart={(event) => onDragStart(event, item)}
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
          </div>
          ))}
      </div>
    </aside>
  )
})

Sidebar.displayName = 'Sidebar'

export default Sidebar
