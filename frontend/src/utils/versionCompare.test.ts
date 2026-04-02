import { describe, expect, it } from 'vitest'

import type { AppEdge, AppNode, ShotNodeData } from '../types'
import { getNodeVersionAssets, getVersionCompareEntries } from './versionCompare'

function createShotNode(dataOverrides: Partial<ShotNodeData> = {}, nodeOverrides: Partial<AppNode> = {}): AppNode {
  const data: ShotNodeData = {
    label: 'Shot',
    title: '镜头',
    description: '镜头描述',
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
    status: 'success',
    progress: 100,
    creditCost: 30,
    outputImage: '/outputs/current.png',
    outputVideo: undefined,
    lastRunSignature: 'sig-current',
    resultCache: {
      'sig-current': '/outputs/current.png',
      'sig-old': '/outputs/old.png',
    },
    needsRefresh: false,
    errorMessage: undefined,
    ...dataOverrides,
  }

  return {
    id: 'shot-1',
    type: 'shot',
    position: { x: 0, y: 0 },
    data,
    ...nodeOverrides,
  } as AppNode
}

describe('version comparison helpers', () => {
  it('collects current and cached versions without duplicates', () => {
    const versions = getNodeVersionAssets(createShotNode())

    expect(versions.assetType).toBe('image')
    expect(versions.versions).toEqual([
      {
        key: expect.stringContaining('shot-1-0-'),
        url: '/outputs/current.png',
        label: '当前版本',
        isCurrent: true,
      },
      {
        key: expect.stringContaining('shot-1-1-'),
        url: '/outputs/old.png',
        label: '历史版本 1',
        isCurrent: false,
      },
    ])
  })

  it('includes sequence metadata for comparable shot entries', () => {
    const firstShot = createShotNode(
      {
        title: '镜头一',
        outputImage: '/outputs/shot-1-current.png',
        resultCache: {
          'sig-1': '/outputs/shot-1-current.png',
          'sig-2': '/outputs/shot-1-old.png',
        },
      },
      {
        id: 'shot-1',
        position: { x: 0, y: 0 },
      }
    )
    const secondShot = createShotNode(
      {
        title: '镜头二',
        outputImage: '/outputs/shot-2-current.png',
        resultCache: {
          'sig-3': '/outputs/shot-2-current.png',
          'sig-4': '/outputs/shot-2-old.png',
        },
      },
      {
        id: 'shot-2',
        position: { x: 320, y: 0 },
      }
    )

    const entries = getVersionCompareEntries(
      [firstShot, secondShot],
      [{ id: 'edge-1', source: 'shot-1', target: 'shot-2' } as AppEdge]
    )

    expect(entries).toHaveLength(2)
    expect(entries[1]).toMatchObject({
      nodeId: 'shot-2',
      sequenceLabel: '片段 01',
      sequenceStep: 2,
      sequenceLength: 2,
    })
  })
})
