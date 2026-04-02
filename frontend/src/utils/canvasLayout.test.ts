import { describe, expect, it } from 'vitest'

import type { AppEdge, AppNode, SceneNodeData, ShotNodeData } from '../types'
import { computeAutoLayoutNodes } from './canvasLayout'

function createSceneNode(
  id: string,
  x: number,
  y: number,
  overrides: Partial<SceneNodeData> = {},
  measuredHeight = 240
): AppNode {
  return {
    id,
    type: 'scene',
    position: { x, y },
    measured: {
      width: 320,
      height: measuredHeight,
    },
    data: {
      label: 'Scene',
      collapsed: false,
      title: '',
      synopsis: '',
      beat: '',
      notes: '',
      ...overrides,
    },
  } as AppNode
}

function createShotNode(
  id: string,
  x: number,
  y: number,
  overrides: Partial<ShotNodeData> = {},
  measuredHeight?: number
): AppNode {
  return {
    id,
    type: 'shot',
    position: { x, y },
    measured: measuredHeight
      ? {
          width: 320,
          height: measuredHeight,
        }
      : undefined,
    data: {
      label: 'Shot',
      collapsed: false,
      title: '',
      description: '',
      prompt: '',
      continuityFrames: Array.from({ length: 9 }, () => ''),
      shotSize: 'medium',
      cameraAngle: 'eye-level',
      motion: '',
      emotion: '',
      aspectRatio: '16:9',
      resolution: '2K',
      outputType: 'image',
      imageAdapter: 'volcengine',
      videoAdapter: 'volcengine',
      durationSeconds: 4,
      motionStrength: 0.6,
      identityLock: false,
      identityStrength: 0.7,
      referenceImages: [],
      status: 'idle',
      progress: 0,
      creditCost: 30,
      resultCache: {},
      needsRefresh: false,
      ...overrides,
    },
  } as AppNode
}

describe('computeAutoLayoutNodes', () => {
  it('stacks sibling nodes vertically with enough spacing for their heights', () => {
    const nodes = [
      createSceneNode('scene-1', 0, 0),
      createShotNode('shot-1', 0, 0, { title: 'Shot 1' }, 380),
      createShotNode('shot-2', 0, 40, { title: 'Shot 2' }, 420),
    ]

    const edges = [
      { id: 'edge-1', source: 'scene-1', target: 'shot-1' },
      { id: 'edge-2', source: 'scene-1', target: 'shot-2' },
    ] as AppEdge[]

    const layoutNodes = computeAutoLayoutNodes(nodes, edges)
    const shot1 = layoutNodes.find((node) => node.id === 'shot-1')!
    const shot2 = layoutNodes.find((node) => node.id === 'shot-2')!
    const scene = layoutNodes.find((node) => node.id === 'scene-1')!

    expect(shot1.position.x).toBeGreaterThan(scene.position.x)
    expect(shot2.position.x).toBe(shot1.position.x)
    expect(shot2.position.y - shot1.position.y).toBeGreaterThanOrEqual(380 + 96)
  })

  it('places disconnected components in separate canvas regions', () => {
    const nodes = [
      createSceneNode('scene-1', 0, 0),
      createShotNode('shot-1', 0, 0, { title: 'Shot 1' }, 360),
      createSceneNode('scene-2', 0, 0, { title: 'Other Scene' }),
    ]

    const edges = [{ id: 'edge-1', source: 'scene-1', target: 'shot-1' }] as AppEdge[]

    const layoutNodes = computeAutoLayoutNodes(nodes, edges)
    const firstScene = layoutNodes.find((node) => node.id === 'scene-1')!
    const secondScene = layoutNodes.find((node) => node.id === 'scene-2')!

    expect(
      secondScene.position.x > firstScene.position.x + 320 ||
      secondScene.position.y > firstScene.position.y + 240
    ).toBe(true)
  })

  it('uses compact fallback heights for collapsed storyboard nodes', () => {
    const nodes = [
      createSceneNode('scene-1', 0, 0),
      createShotNode('shot-collapsed', 0, 0, { title: 'Collapsed', collapsed: true }),
      createShotNode('shot-expanded', 0, 20, { title: 'Expanded' }),
    ]

    const edges = [
      { id: 'edge-1', source: 'scene-1', target: 'shot-collapsed' },
      { id: 'edge-2', source: 'scene-1', target: 'shot-expanded' },
    ] as AppEdge[]

    const layoutNodes = computeAutoLayoutNodes(nodes, edges)
    const collapsedNode = layoutNodes.find((node) => node.id === 'shot-collapsed')!
    const expandedNode = layoutNodes.find((node) => node.id === 'shot-expanded')!

    expect(expandedNode.position.y - collapsedNode.position.y).toBe(152 + 96)
  })
})
