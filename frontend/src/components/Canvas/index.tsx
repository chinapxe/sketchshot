import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import ContextMenu from '../ContextMenu'
import Toolbar from '../Toolbar'
import CharacterNode from '../Nodes/CharacterNode'
import ImageDisplayNode from '../Nodes/ImageDisplayNode'
import ImageGenNode from '../Nodes/ImageGenNode'
import ImageUploadNode from '../Nodes/ImageUploadNode'
import SceneNode from '../Nodes/SceneNode'
import ShotNode from '../Nodes/ShotNode'
import StyleNode from '../Nodes/StyleNode'
import VideoDisplayNode from '../Nodes/VideoDisplayNode'
import VideoGenNode from '../Nodes/VideoGenNode'
import { useFlowStore } from '../../stores/useFlowStore'
import type { AppNode, AppNodeType } from '../../types'
import './style.css'

const nodeTypes = {
  imageUpload: ImageUploadNode,
  imageGen: ImageGenNode,
  imageDisplay: ImageDisplayNode,
  videoGen: VideoGenNode,
  videoDisplay: VideoDisplayNode,
  scene: SceneNode,
  character: CharacterNode,
  style: StyleNode,
  shot: ShotNode,
}

interface ContextMenuState {
  nodeId: string
  x: number
  y: number
  isDisabled: boolean
}

const Canvas = () => {
  const reactFlowRef = useRef<HTMLDivElement>(null)
  const reactFlowInstance = useRef<ReactFlowInstance<AppNode> | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, undo, redo } = useFlowStore()
  const enableViewportVirtualization = nodes.length >= 24

  const onInit = useCallback((instance: ReactFlowInstance<AppNode>) => {
    reactFlowInstance.current = instance
  }, [])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const nodeType = event.dataTransfer.getData('application/reactflow') as AppNodeType
      if (!nodeType) return

      const position = reactFlowInstance.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      if (position) {
        addNode(nodeType, position)
      }
    },
    [addNode]
  )

  const onNodeContextMenu: NodeMouseHandler<AppNode> = useCallback((event, node) => {
    event.preventDefault()

    setContextMenu({
      nodeId: node.id,
      x: event.clientX,
      y: event.clientY,
      isDisabled: (node.data as Record<string, unknown>).disabled === true,
    })
  }, [])

  const onPaneClick = useCallback(() => {
    setContextMenu(null)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [redo, undo])

  return (
    <div className="canvas-wrapper" ref={reactFlowRef}>
      <Toolbar />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={onInit}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        onlyRenderVisibleElements={enableViewportVirtualization}
        snapToGrid
        snapGrid={[16, 16]}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#1677ff', strokeWidth: 2 },
        }}
        connectionLineStyle={{ stroke: '#1677ff', strokeWidth: 2 }}
        deleteKeyCode={['Backspace', 'Delete']}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e0e0e0" />
        <MiniMap nodeStrokeWidth={3} pannable zoomable style={{ background: '#f5f5f5' }} />
      </ReactFlow>

      {contextMenu && (
        <ContextMenu
          nodeId={contextMenu.nodeId}
          x={contextMenu.x}
          y={contextMenu.y}
          isDisabled={contextMenu.isDisabled}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

export default Canvas
