import { describe, expect, it } from 'vitest'

import type { ShotNodeData } from '../types'
import { buildShotGenerationSignature } from './generationSignature'

function createShotData(overrides: Partial<ShotNodeData> = {}): ShotNodeData {
  return {
    label: 'Shot',
    title: 'Hero close up',
    description: 'Hero turns in rain',
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
    referenceImages: ['/uploads/hero.png'],
    contextSignature: 'ctx-1',
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

describe('buildShotGenerationSignature', () => {
  it('includes continuity frames for video shots', () => {
    const base = createShotData({
      outputType: 'video',
      continuityFrames: ['起步', '', '转身', '', '', '', '', '', '停住'],
    })

    const changed = createShotData({
      outputType: 'video',
      continuityFrames: ['起步', '', '转身更快', '', '', '', '', '', '停住'],
    })

    expect(buildShotGenerationSignature(base)).not.toBe(buildShotGenerationSignature(changed))
  })

  it('ignores continuity frames for image shots', () => {
    const base = createShotData({
      outputType: 'image',
      continuityFrames: ['起步', '', '转身', '', '', '', '', '', '停住'],
    })

    const changed = createShotData({
      outputType: 'image',
      continuityFrames: ['完全不同的九宫格', '', '', '', '', '', '', '', ''],
    })

    expect(buildShotGenerationSignature(base)).toBe(buildShotGenerationSignature(changed))
  })
})
