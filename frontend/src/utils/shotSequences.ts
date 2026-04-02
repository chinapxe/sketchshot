import type { AppEdge, AppNode } from '../types'

export interface ShotSequenceInfo {
  sequenceId: string
  sequenceLabel: string
  step: number
  length: number
  rootShotId: string
}

function sortNodesByPosition(a: AppNode, b: AppNode): number {
  if (a.position.y !== b.position.y) return a.position.y - b.position.y
  return a.position.x - b.position.x
}

function sortNodeIdsByPosition(nodeIds: string[], nodeMap: Map<string, AppNode>): string[] {
  return nodeIds.slice().sort((leftId, rightId) => {
    const leftNode = nodeMap.get(leftId)
    const rightNode = nodeMap.get(rightId)

    if (!leftNode || !rightNode) return 0
    return sortNodesByPosition(leftNode, rightNode)
  })
}

export function getShotSequenceMap(nodes: AppNode[], edges: AppEdge[]): Map<string, ShotSequenceInfo> {
  const shotNodes = nodes
    .filter((node): node is Extract<AppNode, { type: 'shot' }> => node.type === 'shot')
    .sort(sortNodesByPosition)
  const shotNodeMap = new Map(shotNodes.map((node) => [node.id, node]))
  const shotIds = new Set(shotNodes.map((node) => node.id))
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()

  shotNodes.forEach((node) => {
    incoming.set(node.id, [])
    outgoing.set(node.id, [])
  })

  edges.forEach((edge) => {
    if (!shotIds.has(edge.source) || !shotIds.has(edge.target)) {
      return
    }

    incoming.get(edge.target)?.push(edge.source)
    outgoing.get(edge.source)?.push(edge.target)
  })

  const roots = shotNodes
    .filter((node) => (incoming.get(node.id) ?? []).length === 0)
    .map((node) => node.id)

  const assignments = new Map<string, { sequenceIndex: number; step: number; rootShotId: string }>()
  const visited = new Set<string>()
  let sequenceIndex = 0

  const traverseSequence = (rootShotId: string, currentSequenceIndex: number) => {
    const queue: Array<{ shotId: string; step: number }> = [{ shotId: rootShotId, step: 1 }]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current.shotId)) {
        continue
      }

      visited.add(current.shotId)
      assignments.set(current.shotId, {
        sequenceIndex: currentSequenceIndex,
        step: current.step,
        rootShotId,
      })

      const nextShotIds = sortNodeIdsByPosition(outgoing.get(current.shotId) ?? [], shotNodeMap)
      nextShotIds.forEach((nextShotId) => {
        if (!visited.has(nextShotId)) {
          queue.push({ shotId: nextShotId, step: current.step + 1 })
        }
      })
    }
  }

  roots.forEach((rootShotId) => {
    if (visited.has(rootShotId)) {
      return
    }

    sequenceIndex += 1
    traverseSequence(rootShotId, sequenceIndex)
  })

  shotNodes.forEach((node) => {
    if (visited.has(node.id)) {
      return
    }

    sequenceIndex += 1
    traverseSequence(node.id, sequenceIndex)
  })

  const sequenceLengths = new Map<number, number>()
  assignments.forEach((assignment) => {
    sequenceLengths.set(assignment.sequenceIndex, (sequenceLengths.get(assignment.sequenceIndex) ?? 0) + 1)
  })

  const sequenceMap = new Map<string, ShotSequenceInfo>()
  assignments.forEach((assignment, shotId) => {
    const length = sequenceLengths.get(assignment.sequenceIndex) ?? 1
    sequenceMap.set(shotId, {
      sequenceId: `sequence-${String(assignment.sequenceIndex).padStart(2, '0')}`,
      sequenceLabel: `片段 ${String(assignment.sequenceIndex).padStart(2, '0')}`,
      step: assignment.step,
      length,
      rootShotId: assignment.rootShotId,
    })
  })

  return sequenceMap
}
