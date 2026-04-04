import { memo, useEffect } from 'react'
import { NodeResizeControl, useUpdateNodeInternals } from '@xyflow/react'

import { useFlowStore } from '../../stores/useFlowStore'
import { MAX_CUSTOM_NODE_WIDTH, clampNodeWidth } from '../../utils/nodeSizing'
import './nodeResize.css'

interface NodeWidthResizerProps {
  nodeId: string
  selected: boolean
  currentWidth: number
  minWidth: number
  maxWidth?: number
}

const NodeWidthResizer = memo(
  ({
    nodeId,
    selected,
    currentWidth,
    minWidth,
    maxWidth = MAX_CUSTOM_NODE_WIDTH,
  }: NodeWidthResizerProps) => {
    const pushHistory = useFlowStore((state) => state._pushHistory)
    const updateNodeWidth = useFlowStore((state) => state.updateNodeWidth)
    const updateNodeInternals = useUpdateNodeInternals()

    useEffect(() => {
      window.requestAnimationFrame(() => updateNodeInternals(nodeId))
    }, [currentWidth, nodeId, updateNodeInternals])

    if (!selected) {
      return null
    }

    const handleResize = (_event: unknown, params: { width: number }) => {
      updateNodeWidth(nodeId, clampNodeWidth(params.width, minWidth, maxWidth))
    }

    return (
      <>
        <NodeResizeControl
          position="left"
          resizeDirection="horizontal"
          minWidth={minWidth}
          maxWidth={maxWidth}
          onResizeStart={() => pushHistory()}
          onResize={handleResize}
          onResizeEnd={handleResize}
          className="node-width-resize-control is-left"
        >
          <div className="node-width-resize-grip" />
        </NodeResizeControl>
        <NodeResizeControl
          position="right"
          resizeDirection="horizontal"
          minWidth={minWidth}
          maxWidth={maxWidth}
          onResizeStart={() => pushHistory()}
          onResize={handleResize}
          onResizeEnd={handleResize}
          className="node-width-resize-control is-right"
        >
          <div className="node-width-resize-grip" />
        </NodeResizeControl>
      </>
    )
  }
)

NodeWidthResizer.displayName = 'NodeWidthResizer'

export default NodeWidthResizer
