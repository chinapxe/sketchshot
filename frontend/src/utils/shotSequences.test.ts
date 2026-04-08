import { describe, expect, it } from 'vitest'

import type { AppEdge, AppNode, ShotNodeData } from '../types'
import { getShotSequenceMap } from './shotSequences'

function createShotNode(id: string, x: number, y: number, title: string): AppNode {
  const data: ShotNodeData = {
    label: 'Shot',
    title,
    description: '',
    prompt: '',
    continuityFrames: Array.from({ length: 9 }, () => ''),
    videoFirstFrame: undefined,
    videoLastFrame: undefined,
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
    contextSignature: '',
    status: 'idle',
    progress: 0,
    creditCost: 30,
    outputImage: undefined,
    outputVideo: undefined,
    lastRunSignature: undefined,
    resultCache: {},
    needsRefresh: false,
    errorMessage: undefined,
  }

  return {
    id,
    type: 'shot',
    position: { x, y },
    data,
  } as AppNode
}

describe('getShotSequenceMap', () => {
  it('assigns connected shots into ordered sequences', () => {
    const nodes: AppNode[] = [
      createShotNode('shot-1', 0, 0, '镜头一'),
      createShotNode('shot-2', 320, 0, '镜头二'),
      createShotNode('shot-3', 640, 0, '镜头三'),
      createShotNode('shot-4', 0, 320, '镜头四'),
    ]

    const edges: AppEdge[] = [
      { id: 'e1', source: 'shot-1', target: 'shot-2' } as AppEdge,
      { id: 'e2', source: 'shot-2', target: 'shot-3' } as AppEdge,
    ]

    const sequenceMap = getShotSequenceMap(nodes, edges)

    expect(sequenceMap.get('shot-1')).toMatchObject({
      sequenceLabel: '片段 01',
      step: 1,
      length: 3,
    })
    expect(sequenceMap.get('shot-2')).toMatchObject({
      sequenceLabel: '片段 01',
      step: 2,
      length: 3,
    })
    expect(sequenceMap.get('shot-3')).toMatchObject({
      sequenceLabel: '片段 01',
      step: 3,
      length: 3,
    })
    expect(sequenceMap.get('shot-4')).toMatchObject({
      sequenceLabel: '片段 02',
      step: 1,
      length: 1,
    })
  })
})
