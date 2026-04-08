import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  MiniMap,
  ReactFlow,
  type Connection,
  type EdgeMouseHandler,
  type IsValidConnection,
  type NodeMouseHandler,
  type OnConnectEnd,
  type OnConnectStart,
  type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import ContextMenu from '../ContextMenu'
import QuickConnectMenu from '../QuickConnectMenu'
import Toolbar from '../Toolbar'
import CharacterNode from '../Nodes/CharacterNode'
import ContinuityNode from '../Nodes/ContinuityNode'
import EdgeContextMenu from '../EdgeContextMenu'
import ImageDisplayNode from '../Nodes/ImageDisplayNode'
import ImageGenNode from '../Nodes/ImageGenNode'
import ImageUploadNode from '../Nodes/ImageUploadNode'
import SceneNode from '../Nodes/SceneNode'
import ShotNode from '../Nodes/ShotNode'
import StyleNode from '../Nodes/StyleNode'
import ThreeViewGenNode from '../Nodes/ThreeViewGenNode'
import VideoDisplayNode from '../Nodes/VideoDisplayNode'
import VideoGenNode from '../Nodes/VideoGenNode'
import { useFlowStore } from '../../stores/useFlowStore'
import type { AppEdge, AppNode, AppNodeType, NodeCreationPayload } from '../../types'
import { getConnectionStroke, getValidTargetNodeTypes, isValidConnection } from '../../utils/flowConnections'
import './style.css'

const nodeTypes = {
  imageUpload: ImageUploadNode,
  imageGen: ImageGenNode,
  threeViewGen: ThreeViewGenNode,
  imageDisplay: ImageDisplayNode,
  videoGen: VideoGenNode,
  videoDisplay: VideoDisplayNode,
  scene: SceneNode,
  character: CharacterNode,
  style: StyleNode,
  continuity: ContinuityNode,
  shot: ShotNode,
}

interface ContextMenuState {
  nodeId: string
  x: number
  y: number
  isDisabled: boolean
}

interface EdgeContextMenuState {
  edgeId: string
  x: number
  y: number
}

interface QuickConnectMenuState {
  sourceNodeId: string
  sourceHandle?: string | null
  x: number
  y: number
  flowPosition: { x: number; y: number }
  targetTypes: AppNodeType[]
}

interface ActiveConnectionState {
  nodeId: string
  handleId?: string | null
  handleType: 'source' | 'target' | null
}

const QUICK_CONNECT_MENU_WIDTH = 280
const QUICK_CONNECT_MENU_HEIGHT = 340
const QUICK_CONNECT_MENU_MARGIN = 12

const clampMenuPosition = (value: number, viewportLimit: number, menuSize: number) =>
  Math.max(QUICK_CONNECT_MENU_MARGIN, Math.min(value, viewportLimit - menuSize - QUICK_CONNECT_MENU_MARGIN))

const getEventClientPosition = (event: MouseEvent | TouchEvent) => {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0] ?? event.touches[0]
    if (!touch) {
      return null
    }

    return {
      x: touch.clientX,
      y: touch.clientY,
    }
  }

  return {
    x: event.clientX,
    y: event.clientY,
  }
}

const isNodeGenerating = (node: AppNode | undefined): boolean => {
  const status = (node?.data as Record<string, unknown> | undefined)?.status
  return status === 'queued' || status === 'processing'
}

const Canvas = () => {
  const reactFlowRef = useRef<HTMLDivElement>(null)
  const reactFlowInstance = useRef<ReactFlowInstance<AppNode, AppEdge> | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [edgeContextMenu, setEdgeContextMenu] = useState<EdgeContextMenuState | null>(null)
  const [quickConnectMenu, setQuickConnectMenu] = useState<QuickConnectMenuState | null>(null)
  const [activeConnection, setActiveConnection] = useState<ActiveConnectionState | null>(null)

  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode, createConnectedNode, undo, redo, selectEdge, clearSelection } =
    useFlowStore()
  const enableViewportVirtualization = nodes.length >= 24
  const styledEdges = useMemo<AppEdge[]>(
    () =>
      edges.map((edge) => {
        const sourceNode = nodes.find((node) => node.id === edge.source)
        const stroke = edge.selected ? '#ff4d4f' : getConnectionStroke(sourceNode)

        return {
          ...edge,
          animated: isNodeGenerating(sourceNode),
          interactionWidth: 28,
          style: {
            ...(edge.style ?? {}),
            stroke,
            strokeWidth: edge.selected ? 4 : 2.5,
            filter: edge.selected ? 'drop-shadow(0 0 6px rgba(255, 77, 79, 0.28))' : undefined,
            cursor: 'pointer',
          },
        }
      }),
    [edges, nodes]
  )
  const activeConnectionStroke = useMemo(() => {
    const sourceNode = nodes.find((node) => node.id === activeConnection?.nodeId)
    return getConnectionStroke(sourceNode)
  }, [activeConnection?.nodeId, nodes])
  const validateConnection: IsValidConnection<AppEdge> = useCallback(
    (edgeOrConnection: AppEdge | Connection) => isValidConnection(edgeOrConnection, nodes, edges),
    [edges, nodes]
  )

  const onInit = useCallback((instance: ReactFlowInstance<AppNode, AppEdge>) => {
    reactFlowInstance.current = instance
  }, [])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      let nodeType = event.dataTransfer.getData('application/reactflow') as AppNodeType
      let initialData: Record<string, unknown> | undefined
      const rawPayload = event.dataTransfer.getData('application/sketchshot-node')

      if (rawPayload) {
        try {
          const payload = JSON.parse(rawPayload) as NodeCreationPayload
          if (payload.type) {
            nodeType = payload.type
          }
          if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
            initialData = payload.data
          }
        } catch (error) {
          console.warn('[canvas] failed to parse node payload', error)
        }
      }

      if (!nodeType) return

      const position = reactFlowInstance.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      if (position) {
        setQuickConnectMenu(null)
        addNode(nodeType, position, initialData)
      }
    },
    [addNode]
  )

  const onNodeContextMenu: NodeMouseHandler<AppNode> = useCallback((event, node) => {
    event.preventDefault()
    setEdgeContextMenu(null)
    setQuickConnectMenu(null)

    setContextMenu({
      nodeId: node.id,
      x: event.clientX,
      y: event.clientY,
      isDisabled: (node.data as Record<string, unknown>).disabled === true,
    })
  }, [])

  const onPaneClick = useCallback(() => {
    setContextMenu(null)
    setEdgeContextMenu(null)
    clearSelection()
  }, [clearSelection])

  const onEdgeClick: EdgeMouseHandler<AppEdge> = useCallback((event, edge) => {
    event.stopPropagation()
    setContextMenu(null)
    setEdgeContextMenu(null)
    setQuickConnectMenu(null)
    selectEdge(edge.id)
  }, [selectEdge])

  const onEdgeContextMenu: EdgeMouseHandler<AppEdge> = useCallback((event, edge) => {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu(null)
    setQuickConnectMenu(null)
    selectEdge(edge.id)
    setEdgeContextMenu({
      edgeId: edge.id,
      x: event.clientX,
      y: event.clientY,
    })
  }, [selectEdge])

  const onConnectStart: OnConnectStart = useCallback((_, params) => {
    setContextMenu(null)
    setEdgeContextMenu(null)
    setQuickConnectMenu(null)
    setActiveConnection(
      params.nodeId
        ? {
            nodeId: params.nodeId,
            handleId: params.handleId,
            handleType: params.handleType,
          }
        : null
    )
  }, [])

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      const currentConnection = activeConnection
      setActiveConnection(null)

      if (!currentConnection || currentConnection.handleType !== 'source') {
        return
      }

      if (connectionState.isValid === true || connectionState.toNode || connectionState.toHandle) {
        return
      }

      const clientPosition = getEventClientPosition(event)
      if (!clientPosition) {
        return
      }

      const flowPosition = reactFlowInstance.current?.screenToFlowPosition(clientPosition, {
        snapToGrid: true,
        snapGrid: [16, 16],
      })
      if (!flowPosition) {
        return
      }

      const targetTypes = getValidTargetNodeTypes(currentConnection.nodeId, nodes)
      if (targetTypes.length === 0) {
        return
      }

      setQuickConnectMenu({
        sourceNodeId: currentConnection.nodeId,
        sourceHandle: currentConnection.handleId,
        x: clampMenuPosition(clientPosition.x, window.innerWidth, QUICK_CONNECT_MENU_WIDTH),
        y: clampMenuPosition(clientPosition.y, window.innerHeight, QUICK_CONNECT_MENU_HEIGHT),
        flowPosition,
        targetTypes,
      })
    },
    [activeConnection, nodes]
  )

  const handleQuickConnectSelect = useCallback(
    (type: AppNodeType) => {
      if (!quickConnectMenu) {
        return
      }

      createConnectedNode(
        quickConnectMenu.sourceNodeId,
        type,
        quickConnectMenu.flowPosition,
        quickConnectMenu.sourceHandle
      )
      setQuickConnectMenu(null)
    },
    [createConnectedNode, quickConnectMenu]
  )

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

      <ReactFlow<AppNode, AppEdge>
        nodes={nodes}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onInit={onInit}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onEdgeClick={onEdgeClick}
        onEdgeContextMenu={onEdgeContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onPaneClick={onPaneClick}
        isValidConnection={validateConnection}
        nodeTypes={nodeTypes}
        fitView
        onlyRenderVisibleElements={enableViewportVirtualization}
        snapToGrid
        snapGrid={[16, 16]}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
        }}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: activeConnectionStroke, strokeWidth: 2.5 }}
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

      {edgeContextMenu && (
        <EdgeContextMenu
          edgeId={edgeContextMenu.edgeId}
          x={edgeContextMenu.x}
          y={edgeContextMenu.y}
          onClose={() => setEdgeContextMenu(null)}
        />
      )}

      {quickConnectMenu && (
        <QuickConnectMenu
          x={quickConnectMenu.x}
          y={quickConnectMenu.y}
          targetTypes={quickConnectMenu.targetTypes}
          onSelect={handleQuickConnectSelect}
          onClose={() => setQuickConnectMenu(null)}
        />
      )}
    </div>
  )
}

export default Canvas
