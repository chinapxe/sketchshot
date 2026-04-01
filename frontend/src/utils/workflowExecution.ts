import type { AppEdge, AppNode } from '../types'

export class WorkflowCycleError extends Error {
  constructor() {
    super('检测到循环依赖，当前工作流无法按拓扑顺序执行')
    this.name = 'WorkflowCycleError'
  }
}

const sortNodesByPosition = (a: AppNode, b: AppNode) => {
  if (a.position.y !== b.position.y) return a.position.y - b.position.y
  return a.position.x - b.position.x
}

function isNodeDisabled(node: AppNode): boolean {
  return (node.data as Record<string, unknown>).disabled === true
}

/**
 * 返回过滤禁用节点后的拓扑顺序，用于一键执行整个工作流。
 */
export function getTopologicallySortedNodes(nodes: AppNode[], edges: AppEdge[]): AppNode[] {
  const activeNodes = nodes.filter((node) => !isNodeDisabled(node))
  const activeNodeIds = new Set(activeNodes.map((node) => node.id))
  const activeEdges = edges.filter((edge) => activeNodeIds.has(edge.source) && activeNodeIds.has(edge.target))

  const indegree = new Map(activeNodes.map((node) => [node.id, 0]))
  const outgoing = new Map(activeNodes.map((node) => [node.id, [] as string[]]))

  activeEdges.forEach((edge) => {
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
    outgoing.get(edge.source)?.push(edge.target)
  })

  const nodeMap = new Map(activeNodes.map((node) => [node.id, node]))
  const queue = activeNodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .sort(sortNodesByPosition)

  const orderedNodes: AppNode[] = []

  while (queue.length > 0) {
    const currentNode = queue.shift()!
    orderedNodes.push(currentNode)

    ;(outgoing.get(currentNode.id) ?? []).forEach((targetId) => {
      indegree.set(targetId, (indegree.get(targetId) ?? 1) - 1)
      if ((indegree.get(targetId) ?? 0) === 0) {
        const targetNode = nodeMap.get(targetId)
        if (targetNode) {
          queue.push(targetNode)
          queue.sort(sortNodesByPosition)
        }
      }
    })
  }

  if (orderedNodes.length !== activeNodes.length) {
    throw new WorkflowCycleError()
  }

  return orderedNodes
}
