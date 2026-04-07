import { describe, expect, it } from 'vitest'

import type { ContinuityNodeData, ImageGenNodeData, ShotNodeData, VideoGenNodeData } from '../types'
import type { ContinuityContext, ShotContext } from '../utils/storyboard'
import {
  buildContinuityFramesRequest,
  buildContinuityPreviewPrompt,
  buildContinuityPromptRequest,
  buildImagePromptRequest,
  buildShotPromptRequest,
  buildVideoPromptRequest,
} from './promptGeneration'

describe('promptGeneration helpers', () => {
  it('builds image prompt requests with reference-aware metadata', () => {
    const chinesePrompt = '\u7535\u5f71\u611f\u5973\u4e3b\u89d2\u8096\u50cf\uff0c\u67d4\u548c\u4e3b\u5149\uff0c\u76ae\u80a4\u7ec6\u8282\u6e05\u6670'

    const data: ImageGenNodeData = {
      label: 'Hero Portrait',
      prompt: chinesePrompt,
      aspectRatio: '3:4',
      resolution: '2K',
      adapter: 'volcengine',
      upstreamReferenceImages: ['/uploads/ref-a.png'],
      manualReferenceImages: ['/uploads/ref-b.png'],
      referenceImages: ['/uploads/ref-a.png', '/uploads/ref-b.png'],
      isUploadingReferences: false,
      referenceUploadError: undefined,
      identityLock: true,
      identityStrength: 0.8,
      status: 'idle',
      progress: 0,
      creditCost: 30,
      resultCache: {},
      needsRefresh: false,
      outputImage: undefined,
      lastRunSignature: undefined,
      errorMessage: undefined,
    }

    expect(buildImagePromptRequest(data)).toEqual({
      task_type: 'image',
      user_input: chinesePrompt,
      style: 'reference-guided cinematic image',
      aspect_ratio: '3:4',
      extra_requirements: [
        'Target resolution: 2K',
        'Reference images available: 2',
        'Maintain exact character identity from the reference images with maximum consistency.',
      ],
      language: 'zh',
    })
  })

  it('builds fallback video prompt requests for image-to-video generation', () => {
    const data: VideoGenNodeData = {
      label: 'Motion Clip',
      prompt: '',
      aspectRatio: '16:9',
      durationSeconds: 4,
      motionStrength: 0.65,
      adapter: 'volcengine',
      sourceImages: ['/outputs/frame-a.png', '/outputs/frame-b.png'],
      status: 'idle',
      progress: 0,
      creditCost: 90,
      outputVideo: undefined,
      lastRunSignature: undefined,
      resultCache: {},
      needsRefresh: false,
      errorMessage: undefined,
    }

    expect(buildVideoPromptRequest(data)).toEqual({
      task_type: 'video',
      user_input:
        'Create an image-to-video motion prompt based on the connected key frames, emphasizing camera movement and subject motion.',
      style: 'cinematic motion prompt',
      aspect_ratio: '16:9',
      extra_requirements: [
        'Target duration: 4s',
        'Motion strength: 65%',
        'Source images available: 2',
      ],
      language: 'en',
    })
  })

  it('builds storyboard shot prompt requests with scene, character, and style context', () => {
    const data: ShotNodeData = {
      label: 'Shot',
      title: '主角回头',
      description: '主角在雨夜天台回头，眼神复杂',
      prompt: '强调风衣被雨打湿的质感',
      continuityFrames: Array.from({ length: 9 }, (_, index) =>
        index === 0
          ? '人物站定，风衣下摆被风掀起'
          : index === 4
            ? '人物回头到一半，眼神开始变化'
            : index === 8
              ? '人物完全回头，视线锁定镜头外目标'
              : ''
      ),
      shotSize: 'medium',
      cameraAngle: 'eye-level',
      motion: '缓慢回头',
      emotion: '压抑又决绝',
      aspectRatio: '16:9',
      resolution: '2K',
      outputType: 'image',
      imageAdapter: 'volcengine',
      videoAdapter: 'volcengine',
      durationSeconds: 4,
      motionStrength: 0.6,
      identityLock: true,
      identityStrength: 0.75,
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
    }

    const context: ShotContext = {
      scenes: [
        {
          id: 'scene-1',
          title: '雨夜天台对峙',
          synopsis: '主角终于逼近真相',
          beat: '关系破裂',
        },
      ],
      characters: [
        {
          id: 'character-1',
          name: '沈迟',
          role: '调查记者',
          appearance: '短发、消瘦、眼神警惕',
          temperamentTags: ['疲惫', '压抑'],
          stateTags: ['湿发'],
          wardrobe: '深色风衣',
          props: '录音笔',
          notes: '情绪收着演',
        },
      ],
      styles: [
        {
          id: 'style-1',
          styleTags: [],
          paletteTags: [],
          lightingTags: [],
          framingTags: [],
          qualityTags: [],
          name: '冷峻都市悬疑',
          keywords: '雨夜霓虹、低饱和、电影感',
          palette: '冷青灰',
          lighting: '侧逆光',
          framing: '压迫式留白',
          notes: '',
        },
      ],
      previousShots: [],
      continuity: null,
      continuityCount: 0,
      referenceAssets: [
        {
          url: '/uploads/hero.png',
          title: '沈迟 参考 1',
          sourceNodeId: 'character-1',
          sourceNodeType: 'character',
          relation: '角色参考',
        },
      ],
      referenceImages: ['/uploads/hero.png'],
      contextSignature: 'ctx-1',
    }

    expect(buildShotPromptRequest(data, context)).toEqual({
      task_type: 'image',
      user_input: [
        '场次上下文：雨夜天台对峙；主角终于逼近真相；关系破裂',
        '角色设定：沈迟，调查记者，短发、消瘦、眼神警惕，气质：疲惫、压抑，状态：湿发，深色风衣，录音笔，情绪收着演',
        '风格设定：冷峻都市悬疑；风格：雨夜霓虹、低饱和、电影感；色彩：冷青灰；光线：侧逆光；构图：压迫式留白',
        '镜头要求：主角回头；主角在雨夜天台回头，眼神复杂；景别：中景；机位：平视；动作：缓慢回头；情绪：压抑又决绝',
        '补充提示：强调风衣被雨打湿的质感',
      ].join('\n'),
      style: '冷峻都市悬疑',
      aspect_ratio: '16:9',
      extra_requirements: [
        'Shot size: 中景',
        'Camera angle: 平视',
        'Target resolution: 2K',
        'Characters attached: 1',
        'Styles attached: 1',
        'Reference images available: 1',
        'Maintain exact character identity from the reference images with maximum consistency.',
      ],
      language: 'zh',
    })
  })

  it('includes continuity frames when building a storyboard video prompt request', () => {
    const data: ShotNodeData = {
      label: 'Shot',
      title: '奔跑后停下',
      description: '角色在走廊尽头停住并回头',
      prompt: '',
      continuityFrames: [
        '角色冲进画面',
        '脚步急促逼近镜头',
        '身体略微失衡',
        '扶墙减速',
        '停住呼吸急促',
        '肩膀先回转',
        '头部慢慢回看',
        '视线锁定远处',
        '情绪最终沉下来',
      ],
      shotSize: 'medium',
      cameraAngle: 'eye-level',
      motion: '先冲刺后停住再回头',
      emotion: '紧张后转为警觉',
      aspectRatio: '16:9',
      resolution: '2K',
      outputType: 'video',
      imageAdapter: 'volcengine',
      videoAdapter: 'volcengine',
      durationSeconds: 5,
      motionStrength: 0.75,
      videoFirstFrame: '/uploads/hero.png',
      videoLastFrame: '/uploads/final.png',
      identityLock: false,
      identityStrength: 0.7,
      referenceImages: ['/uploads/hero.png', '/uploads/final.png'],
      contextSignature: 'ctx-video',
      status: 'idle',
      progress: 0,
      creditCost: 90,
      outputImage: undefined,
      outputVideo: undefined,
      lastRunSignature: undefined,
      resultCache: {},
      needsRefresh: false,
      errorMessage: undefined,
    }

    const context: ShotContext = {
      scenes: [],
      characters: [],
      styles: [],
      previousShots: [
        {
          id: 'shot-prev',
          title: '上一镜头冲刺',
          description: '角色从走廊另一端快速冲来',
          outputType: 'image',
        },
      ],
      continuity: null,
      continuityCount: 0,
      referenceAssets: [
        {
          url: '/uploads/hero.png',
          title: '起始画面',
          sourceNodeId: 'upload-start',
          sourceNodeType: 'imageUpload',
          relation: '上传源图',
        },
        {
          url: '/uploads/final.png',
          title: '收束画面',
          sourceNodeId: 'upload-end',
          sourceNodeType: 'imageUpload',
          relation: '上传源图',
        },
      ],
      referenceImages: ['/uploads/hero.png', '/uploads/final.png'],
      contextSignature: 'ctx-video',
    }

    const request = buildShotPromptRequest(data, context)

    expect(request.task_type).toBe('video')
    expect(request.user_input).toContain('承接镜头：上一镜头冲刺；角色从走廊另一端快速冲来；上游为图像镜头')
    expect(request.user_input).toContain('首帧约束：起始画面（上传源图）')
    expect(request.user_input).toContain('尾帧约束：收束画面（上传源图）')
    expect(request.user_input).toContain('九宫格连续动作：1. 角色冲进画面')
    expect(request.user_input).toContain('9. 情绪最终沉下来')
    expect(request.extra_requirements).toContain('Target duration: 5s')
    expect(request.extra_requirements).toContain('Motion strength: 75%')
    expect(request.extra_requirements).toContain('First frame locked')
    expect(request.extra_requirements).toContain('Last frame locked')
    expect(request.extra_requirements).toContain('Upstream shots attached: 1')
  })

  it('builds continuity prompt requests with upstream reference context', () => {
    const data: ContinuityNodeData = {
      label: '九宫格动作',
      collapsed: false,
      prompt: '角色从门外冲入，减速后回头，最后定住视线。',
      frames: Array.from({ length: 9 }, () => ''),
    }

    const context: ContinuityContext = {
      scenes: [
        {
          id: 'scene-1',
          title: '废弃走廊追逐',
          synopsis: '角色刚摆脱追兵',
          beat: '短暂停顿后察觉危险仍未解除',
        },
      ],
      characters: [
        {
          id: 'character-1',
          name: '林策',
          role: '逃亡者',
          appearance: '黑色外套，呼吸急促，额头带汗',
          temperamentTags: ['警觉'],
          stateTags: ['奔跑后'],
          wardrobe: '黑色连帽外套',
          props: '手电筒',
          notes: '神情不要夸张',
        },
      ],
      styles: [
        {
          id: 'style-1',
          name: '冷峻悬疑',
          keywords: '低饱和、冷色顶光、电影感',
          palette: '冷青灰',
          lighting: '顶光压迫',
          framing: '纵深透视',
          styleTags: ['动作悬疑'],
          paletteTags: ['冷青灰'],
          lightingTags: ['顶光压迫'],
          framingTags: ['纵深透视'],
          qualityTags: ['电影感'],
          notes: '',
        },
      ],
      referenceAssets: [
        {
          url: '/uploads/hero.png',
          title: '林策 参考 1',
          sourceNodeId: 'character-1',
          sourceNodeType: 'character',
          relation: '角色参考',
        },
      ],
      referenceImages: ['/uploads/hero.png'],
      contextSignature: 'continuity-ctx-1',
    }

    const request = buildContinuityPromptRequest(data, context)
    expect(request.task_type).toBe('general')
    expect(request.user_input).toBe('角色从门外冲入，减速后回头，最后定住视线。')
    expect(request.style).toBe('冷峻悬疑')
    expect(request.reference_images).toEqual(['/uploads/hero.png'])
    expect(request.extra_requirements).toContain(
      'Return one polished master prompt for a nine-panel storyboard or 3x3 continuity grid.'
    )
    expect(request.extra_requirements).toContain('Reference images available: 1')
    expect(request.extra_requirements.some((item) => item.includes('场次设定：废弃走廊追逐'))).toBe(true)
    expect(request.extra_requirements.some((item) => item.includes('角色设定：林策'))).toBe(true)
  })

  it('builds continuity frame generation requests from prompt and upstream context', () => {
    const data: ContinuityNodeData = {
      label: '九宫格动作',
      collapsed: false,
      prompt: '角色从门外冲入，减速后回头，最后定住视线。',
      frames: Array.from({ length: 9 }, () => ''),
    }

    const context: ContinuityContext = {
      scenes: [],
      characters: [],
      styles: [],
      referenceAssets: [
        {
          url: '/uploads/hero.png',
          title: '林策 参考 1',
          sourceNodeId: 'character-1',
          sourceNodeType: 'character',
          relation: '角色参考',
        },
      ],
      referenceImages: ['/uploads/hero.png'],
      contextSignature: 'continuity-ctx-2',
    }

    const request = buildContinuityFramesRequest(data, context)
    expect(request.language).toBe('zh')
    expect(request.reference_images).toEqual(['/uploads/hero.png'])
    expect(request.user_input).toContain('九宫格总提示词：角色从门外冲入，减速后回头，最后定住视线。')
    expect(request.user_input).toContain('参考图线索：林策 参考 1（角色参考）')
  })

  it('builds continuity preview prompts for single-image nine-panel generation', () => {
    const data: ContinuityNodeData = {
      label: '九宫格动作',
      collapsed: false,
      prompt: '角色冲入画面后逐步停下并回头。',
      frames: ['冲入', '加速逼近', '减速', '', '停顿观察', '', '肩膀回转', '头部回看', '定住视线'],
    }

    const context: ContinuityContext = {
      scenes: [],
      characters: [],
      styles: [],
      referenceAssets: [
        {
          url: '/uploads/hero.png',
          title: '角色参考',
          sourceNodeId: 'character-1',
          sourceNodeType: 'character',
          relation: '角色参考',
        },
      ],
      referenceImages: ['/uploads/hero.png'],
      contextSignature: 'continuity-preview-1',
    }

    const prompt = buildContinuityPreviewPrompt(data, context)
    expect(prompt).toContain('单张 3x3 九宫格拼图')
    expect(prompt).toContain('九宫格总提示词：角色冲入画面后逐步停下并回头。')
    expect(prompt).toContain('1. 冲入')
    expect(prompt).toContain('9. 定住视线')
    expect(prompt).toContain('参考图线索：角色参考（角色参考）')
  })
})
