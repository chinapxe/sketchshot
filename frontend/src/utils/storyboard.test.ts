import { describe, expect, it } from 'vitest'

import type { AppEdge, AppNode, ShotNodeData } from '../types'
import { getShotContext, getShotVideoSourceImages } from './storyboard'

function createShotData(overrides: Partial<ShotNodeData> = {}): ShotNodeData {
  return {
    label: 'Shot',
    title: '镜头',
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
    ...overrides,
  }
}

describe('storyboard shot helpers', () => {
  it('collects direct upstream shots into shot context', () => {
    const nodes: AppNode[] = [
      {
        id: 'shot-1',
        type: 'shot',
        position: { x: 0, y: 0 },
        data: createShotData({
          title: '上一镜头',
          description: '角色从暗处走出',
          outputType: 'image',
          outputImage: '/outputs/shot-1.png',
        }),
      } as AppNode,
      {
        id: 'shot-2',
        type: 'shot',
        position: { x: 320, y: 0 },
        data: createShotData({
          title: '当前镜头',
          outputType: 'video',
        }),
      } as AppNode,
    ]

    const edges: AppEdge[] = [
      {
        id: 'shot-link',
        source: 'shot-1',
        target: 'shot-2',
      } as AppEdge,
    ]

    const context = getShotContext('shot-2', nodes, edges)

    expect(context.previousShots).toEqual([
      {
        id: 'shot-1',
        title: '上一镜头',
        description: '角色从暗处走出',
        outputType: 'image',
      },
    ])
    expect(context.referenceImages).toEqual(['/outputs/shot-1.png'])
  })

  it('prefers explicitly selected first and last frame images for video shots', () => {
    const data = createShotData({
      outputType: 'video',
      videoFirstFrame: '/uploads/start.png',
      videoLastFrame: '/uploads/end.png',
    })

    const sourceImages = getShotVideoSourceImages(data, {
      scenes: [],
      characters: [],
      styles: [],
      previousShots: [],
      referenceAssets: [
        {
          url: '/uploads/start.png',
          title: '起始帧',
          sourceNodeId: 'upload-1',
          sourceNodeType: 'imageUpload',
          relation: '上传源图',
        },
        {
          url: '/uploads/end.png',
          title: '结束帧',
          sourceNodeId: 'upload-2',
          sourceNodeType: 'imageUpload',
          relation: '上传源图',
        },
      ],
      referenceImages: ['/uploads/start.png', '/uploads/end.png'],
      contextSignature: 'ctx-video',
    })

    expect(sourceImages).toEqual(['/uploads/start.png', '/uploads/end.png'])
  })
})
