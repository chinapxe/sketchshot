import type { AppEdge, AppNode, AppNodeType } from '../types'

const LAYOUT_START_X = 80
const LAYOUT_START_Y = 80
const LAYOUT_COLUMN_GAP = 120
const LAYOUT_ROW_GAP = 96
const LAYOUT_COMPONENT_GAP_X = 180
const LAYOUT_COMPONENT_GAP_Y = 180
const LAYOUT_MAX_ROW_WIDTH = 2200

type NodeSize = {
  width: number
  height: number
}

const storyboardTypes = new Set<AppNodeType>(['scene', 'character', 'style', 'shot'])

const DEFAULT_NODE_SIZES: Record<AppNodeType, NodeSize> = {
  imageUpload: { width: 240, height: 180 },
  imageGen: { width: 300, height: 460 },
  imageDisplay: { width: 280, height: 240 },
  videoGen: { width: 300, height: 420 },
  videoDisplay: { width: 280, height: 260 },
  scene: { width: 320, height: 340 },
  character: { width: 320, height: 620 },
  style: { width: 320, height: 360 },
  shot: { width: 320, height: 1040 },
}

function sortNodesByPosition(left: AppNode, right: AppNode) {
  if (left.position.y !== right.position.y) {
    return left.position.y - right.position.y
  }

  return left.position.x - right.position.x
}

function getNodeFallbackSize(node: AppNode): NodeSize {
  const baseSize = DEFAULT_NODE_SIZES[node.type]
  const isCollapsed = (node.data as { collapsed?: boolean }).collapsed === true

  if (isCollapsed && storyboardTypes.has(node.type)) {
    return {
      width: baseSize.width,
      height: 152,
    }
  }

  return baseSize
}

function getNodeSize(node: AppNode): NodeSize {
  const fallbackSize = getNodeFallbackSize(node)
  const measuredNode = node as AppNode & {
    measured?: {
      width?: number
      height?: number
    }
    width?: number
    height?: number
  }

  return {
    width: measuredNode.measured?.width ?? measuredNode.width ?? fallbackSize.width,
    height: measuredNode.measured?.height ?? measuredNode.height ?? fallbackSize.height,
  }
}

function getConnectedComponents(nodes: AppNode[], edges: AppEdge[]): AppNode[][] {
  const adjacency = new Map(nodes.map((node) => [node.id, new Set<string>()]))

  edges.forEach((edge) => {
    adjacency.get(edge.source)?.add(edge.target)
    adjacency.get(edge.target)?.add(edge.source)
  })

  const orderedNodes = [...nodes].sort(sortNodesByPosition)
  const visited = new Set<string>()
  const components: AppNode[][] = []

  orderedNodes.forEach((node) => {
    if (visited.has(node.id)) return

    const queue = [node.id]
    const componentIds: string[] = []
    visited.add(node.id)

    while (queue.length > 0) {
      const currentId = queue.shift()!
      componentIds.push(currentId)

      adjacency.get(currentId)?.forEach((neighborId) => {
        if (visited.has(neighborId)) return
        visited.add(neighborId)
        queue.push(neighborId)
      })
    }

    components.push(
      componentIds
        .map((id) => nodes.find((item) => item.id === id))
        .filter((item): item is AppNode => Boolean(item))
        .sort(sortNodesByPosition)
    )
  })

  return components
}

function assignLevels(nodes: AppNode[], edges: AppEdge[]): Map<string, number> {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const indegree = new Map(nodes.map((node) => [node.id, 0]))
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]))
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]))

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) return

    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    incoming.get(edge.target)?.push(edge.source)
    outgoing.get(edge.source)?.push(edge.target)
  })

  const orderedNodes = [...nodes].sort(sortNodesByPosition)
  const queue = orderedNodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id)

  const levels = new Map<string, number>()
  const visited = new Set<string>()

  while (visited.size < nodes.length) {
    if (queue.length === 0) {
      const fallbackNode = orderedNodes.find((node) => !visited.has(node.id))
      if (!fallbackNode) break
      queue.push(fallbackNode.id)
    }

    const currentId = queue.shift()!
    if (visited.has(currentId)) continue

    visited.add(currentId)

    const parentIds = incoming.get(currentId) ?? []
    const level = parentIds.length === 0
      ? 0
      : Math.max(...parentIds.map((parentId) => levels.get(parentId) ?? 0)) + 1

    levels.set(currentId, level)

    ;(outgoing.get(currentId) ?? []).forEach((targetId) => {
      indegree.set(targetId, (indegree.get(targetId) ?? 1) - 1)
      if ((indegree.get(targetId) ?? 0) <= 0) {
        queue.push(targetId)
      }
    })
  }

  return levels
}

function layoutComponent(
  nodes: AppNode[],
  edges: AppEdge[],
  origin: { x: number; y: number }
): {
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
} {
  const levels = assignLevels(nodes, edges)
  const levelBuckets = new Map<number, AppNode[]>()

  nodes.forEach((node) => {
    const level = levels.get(node.id) ?? 0
    const bucket = levelBuckets.get(level) ?? []
    bucket.push(node)
    levelBuckets.set(level, bucket)
  })

  levelBuckets.forEach((bucket) => bucket.sort(sortNodesByPosition))

  const orderedLevels = [...levelBuckets.keys()].sort((left, right) => left - right)
  const columnWidths = orderedLevels.map((level) =>
    Math.max(...(levelBuckets.get(level) ?? []).map((node) => getNodeSize(node).width))
  )

  const positions = new Map<string, { x: number; y: number }>()
  let xCursor = origin.x
  let componentHeight = 0

  orderedLevels.forEach((level, columnIndex) => {
    const bucket = levelBuckets.get(level) ?? []
    let yCursor = origin.y

    bucket.forEach((node) => {
      positions.set(node.id, { x: xCursor, y: yCursor })
      yCursor += getNodeSize(node).height + LAYOUT_ROW_GAP
    })

    const columnHeight = bucket.reduce((total, node, nodeIndex) => {
      const { height } = getNodeSize(node)
      return total + height + (nodeIndex < bucket.length - 1 ? LAYOUT_ROW_GAP : 0)
    }, 0)

    componentHeight = Math.max(componentHeight, columnHeight)
    xCursor += columnWidths[columnIndex] + LAYOUT_COLUMN_GAP
  })

  const componentWidth = columnWidths.reduce((total, width, index) => {
    return total + width + (index < columnWidths.length - 1 ? LAYOUT_COLUMN_GAP : 0)
  }, 0)

  return {
    positions,
    width: componentWidth,
    height: componentHeight,
  }
}

export function computeAutoLayoutNodes(nodes: AppNode[], edges: AppEdge[]): AppNode[] {
  if (nodes.length === 0) return []

  const components = getConnectedComponents(nodes, edges)
  const positions = new Map<string, { x: number; y: number }>()
  let currentX = LAYOUT_START_X
  let currentY = LAYOUT_START_Y
  let currentRowHeight = 0

  components.forEach((componentNodes) => {
    const componentNodeIds = new Set(componentNodes.map((node) => node.id))
    const componentEdges = edges.filter(
      (edge) => componentNodeIds.has(edge.source) && componentNodeIds.has(edge.target)
    )

    let componentLayout = layoutComponent(componentNodes, componentEdges, {
      x: currentX,
      y: currentY,
    })

    if (
      currentX > LAYOUT_START_X &&
      currentX + componentLayout.width > LAYOUT_MAX_ROW_WIDTH
    ) {
      currentX = LAYOUT_START_X
      currentY += currentRowHeight + LAYOUT_COMPONENT_GAP_Y
      currentRowHeight = 0
      componentLayout = layoutComponent(componentNodes, componentEdges, {
        x: currentX,
        y: currentY,
      })
    }

    componentLayout.positions.forEach((position, nodeId) => {
      positions.set(nodeId, position)
    })

    currentX += componentLayout.width + LAYOUT_COMPONENT_GAP_X
    currentRowHeight = Math.max(currentRowHeight, componentLayout.height)
  })

  return nodes.map((node) => ({
    ...node,
    selected: false,
    position: positions.get(node.id) ?? node.position,
  }))
}
