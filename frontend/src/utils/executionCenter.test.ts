import { describe, expect, it } from 'vitest'

import type { AppEdge, AppNode } from '../types'
import { getExecutionCenterEntriesWithEdges } from './executionCenter'

describe('getExecutionCenterEntries', () => {
  it('collects storyboard shots and legacy generation nodes into a sorted execution list', () => {
    const nodes: AppNode[] = [
      {
        id: 'video-1',
        type: 'videoGen',
        position: { x: 640, y: 220 },
        data: {
          label: 'Video Motion',
          prompt: 'camera push in',
          aspectRatio: '16:9',
          durationSeconds: 4,
          motionStrength: 0.6,
          adapter: 'volcengine',
          sourceImages: ['/outputs/frame.png'],
          status: 'processing',
          progress: 44,
          creditCost: 90,
          resultCache: {},
          needsRefresh: false,
          outputVideo: undefined,
          lastRunSignature: undefined,
          errorMessage: undefined,
        },
      } as AppNode,
      {
        id: 'shot-1',
        type: 'shot',
        position: { x: 320, y: 120 },
        data: {
          label: 'Shot',
          title: 'Hero close up',
          description: 'Hero turns in rain',
          prompt: '',
          continuityFrames: Array.from({ length: 9 }, () => ''),
          videoFirstFrame: undefined,
          videoLastFrame: undefined,
          shotSize: 'close-up',
          cameraAngle: 'eye-level',
          motion: '',
          emotion: 'tense',
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
          outputImage: '/outputs/shot.png',
          outputVideo: undefined,
          lastRunSignature: 'sig-current',
          resultCache: {
            'sig-current': '/outputs/shot.png',
            'sig-old': '/outputs/shot-v2.png',
          },
          needsRefresh: false,
          errorMessage: undefined,
        },
      } as AppNode,
      {
        id: 'scene-1',
        type: 'scene',
        position: { x: 0, y: 0 },
        data: {
          label: 'Scene',
          title: 'Rooftop',
          synopsis: 'Conflict peaks',
          beat: 'Decision made',
          notes: '',
        },
      } as AppNode,
    ]

    const edges: AppEdge[] = []
    const entries = getExecutionCenterEntriesWithEdges(nodes, edges)

    expect(entries).toEqual([
      {
        id: 'shot-1',
        nodeType: 'shot',
        title: 'Hero close up',
        subtitle: 'Hero turns in rain',
        status: 'success',
        progress: 100,
        disabled: false,
        assetType: 'image',
        assetUrl: '/outputs/shot.png',
        sequenceLabel: '片段 01',
        sequenceStep: 1,
        sequenceLength: 1,
        versionCount: 2,
      },
      {
        id: 'video-1',
        nodeType: 'videoGen',
        title: 'Video Motion',
        subtitle: 'camera push in',
        status: 'processing',
        progress: 44,
        disabled: false,
        assetType: undefined,
        assetUrl: undefined,
        errorMessage: undefined,
        versionCount: 0,
      },
    ])
  })
})
