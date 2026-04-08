import { describe, expect, it } from 'vitest'

import type { AppEdge, AppNode, ShotNodeData } from '../types'
import { getShotContext, getShotVideoSourceImages, resolveShotContinuityFrames } from './storyboard'

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
      continuity: null,
      continuityCount: 0,
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

  it('prefers an upstream continuity node over legacy shot continuity data', () => {
    const nodes: AppNode[] = [
      {
        id: 'continuity-1',
        type: 'continuity',
        position: { x: 0, y: 0 },
        data: {
          label: '九宫格动作',
          prompt: '',
          frames: ['起步', '', '减速', '', '回头', '', '', '', '停住'],
          outputImage: '/outputs/continuity-grid.png',
        },
      } as AppNode,
      {
        id: 'shot-1',
        type: 'shot',
        position: { x: 320, y: 0 },
        data: createShotData({
          outputType: 'video',
          continuityFrames: ['旧数据', '', '', '', '', '', '', '', ''],
        }),
      } as AppNode,
    ]

    const edges: AppEdge[] = [
      {
        id: 'continuity-link',
        source: 'continuity-1',
        target: 'shot-1',
      } as AppEdge,
    ]

    const context = getShotContext('shot-1', nodes, edges)
    const resolvedFrames = resolveShotContinuityFrames(nodes[1].data as ShotNodeData, context)

    expect(context.continuity?.label).toBe('九宫格动作')
    expect(context.continuityCount).toBe(1)
    expect(context.referenceImages).toContain('/outputs/continuity-grid.png')
    expect(resolvedFrames[0]).toBe('起步')
    expect(resolvedFrames[2]).toBe('减速')
    expect(resolvedFrames[8]).toBe('停住')
  })
  it('filters three-view split references by source handle in shot context', () => {
    const nodes: AppNode[] = [
      {
        id: 'three-view-1',
        type: 'threeViewGen',
        position: { x: 0, y: 0 },
        data: {
          label: 'Three View',
          prompt: 'hero split',
          aspectRatio: '16:9',
          resolution: '2K',
          adapter: 'volcengine',
          referenceImages: ['/uploads/hero.png'],
          outputMode: 'split',
          status: 'success',
          progress: 100,
          creditCost: 90,
          outputImages: {
            front: '/outputs/hero-front.png',
            side: '/outputs/hero-side.png',
            back: '/outputs/hero-back.png',
          },
          splitResultCache: {},
          needsRefresh: false,
          resultCache: {},
        },
      } as AppNode,
      {
        id: 'shot-1',
        type: 'shot',
        position: { x: 320, y: 0 },
        data: createShotData(),
      } as AppNode,
    ]

    const edges: AppEdge[] = [
      {
        id: 'three-view-front-shot',
        source: 'three-view-1',
        sourceHandle: 'output-front',
        target: 'shot-1',
      } as AppEdge,
    ]

    const context = getShotContext('shot-1', nodes, edges)

    expect(context.referenceImages).toContain('/outputs/hero-front.png')
    expect(context.referenceImages).not.toContain('/outputs/hero-side.png')
    expect(context.referenceImages).not.toContain('/outputs/hero-back.png')
  })

  it('prefers character three-view slots over generated three-view cache in shot context', () => {
    const nodes: AppNode[] = [
      {
        id: 'character-1',
        type: 'character',
        position: { x: 0, y: 0 },
        data: {
          label: 'Character',
          name: 'Hero',
          role: 'Lead',
          appearance: '',
          wardrobe: '',
          props: '',
          notes: '',
          referenceImages: ['/uploads/hero.png'],
          threeViewImages: {
            front: '/outputs/hero-front.png',
          },
          generatedThreeViewImages: {
            front: '/outputs/generated-front.png',
            side: '/outputs/generated-side.png',
          },
        },
      } as AppNode,
      {
        id: 'shot-1',
        type: 'shot',
        position: { x: 320, y: 0 },
        data: createShotData(),
      } as AppNode,
    ]

    const edges: AppEdge[] = [
      {
        id: 'character-shot',
        source: 'character-1',
        target: 'shot-1',
      } as AppEdge,
    ]

    const context = getShotContext('shot-1', nodes, edges)

    expect(context.referenceImages).toContain('/outputs/hero-front.png')
    expect(context.referenceImages).toContain('/uploads/hero.png')
    expect(context.referenceImages).not.toContain('/outputs/generated-front.png')
    expect(context.referenceImages).not.toContain('/outputs/generated-side.png')
  })
})
