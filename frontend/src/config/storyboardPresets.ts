import type { CameraAngle, ShotSize } from '../types'

export interface PresetOption<TValue extends string = string> {
  value: TValue
  label: string
}

export const SHOT_SIZE_OPTIONS: PresetOption<Exclude<ShotSize, 'establishing'>>[] = [
  { value: 'extreme-close-up', label: '特写' },
  { value: 'close-up', label: '近景' },
  { value: 'medium-close-up', label: '中近景' },
  { value: 'medium', label: '中景' },
  { value: 'medium-wide', label: '中远景' },
  { value: 'wide', label: '远景' },
  { value: 'extreme-wide', label: '大全景' },
]

export const CAMERA_ANGLE_OPTIONS: PresetOption<CameraAngle>[] = [
  { value: 'eye-level', label: '平视' },
  { value: 'low-angle', label: '低机位' },
  { value: 'high-angle', label: '高机位' },
  { value: 'over-shoulder', label: '肩后视角' },
  { value: 'top-down', label: '俯拍' },
]

export const SHOT_CAMERA_MOVEMENT_OPTIONS: PresetOption[] = [
  { value: '静止镜头', label: '静止镜头' },
  { value: '缓慢推近', label: '缓慢推近' },
  { value: '缓慢拉远', label: '缓慢拉远' },
  { value: '平移跟拍', label: '平移跟拍' },
  { value: '环绕跟拍', label: '环绕跟拍' },
  { value: '手持跟随', label: '手持跟随' },
  { value: '低速摇镜', label: '低速摇镜' },
  { value: '升降镜头', label: '升降镜头' },
  { value: '快速甩镜', label: '快速甩镜' },
]

export const SHOT_COMPOSITION_OPTIONS: PresetOption[] = [
  { value: '居中构图', label: '居中构图' },
  { value: '三分法构图', label: '三分法构图' },
  { value: '对称构图', label: '对称构图' },
  { value: '前景遮挡', label: '前景遮挡' },
  { value: '框中框', label: '框中框' },
  { value: '斜线构图', label: '斜线构图' },
  { value: '大面积留白', label: '大面积留白' },
  { value: '纵深透视', label: '纵深透视' },
]

export const SHOT_LIGHTING_OPTIONS: PresetOption[] = [
  { value: '自然柔光', label: '自然柔光' },
  { value: '侧逆光', label: '侧逆光' },
  { value: '顶光压迫', label: '顶光压迫' },
  { value: '轮廓边缘光', label: '轮廓边缘光' },
  { value: '窗边光', label: '窗边光' },
  { value: '霓虹混合光', label: '霓虹混合光' },
  { value: '雨夜反光', label: '雨夜反光' },
  { value: '硬光剪影', label: '硬光剪影' },
]

export const SHOT_MOOD_OPTIONS: PresetOption[] = [
  { value: '压抑', label: '压抑' },
  { value: '紧张', label: '紧张' },
  { value: '孤独', label: '孤独' },
  { value: '神秘', label: '神秘' },
  { value: '决绝', label: '决绝' },
  { value: '梦幻', label: '梦幻' },
  { value: '温暖', label: '温暖' },
  { value: '冷峻', label: '冷峻' },
]

export const SHOT_QUALITY_OPTIONS: PresetOption[] = [
  { value: '电影感', label: '电影感' },
  { value: '胶片颗粒', label: '胶片颗粒' },
  { value: '超写实', label: '超写实' },
  { value: '细节丰富', label: '细节丰富' },
  { value: '空气透视', label: '空气透视' },
  { value: '高级质感', label: '高级质感' },
]

export const STYLE_TAG_OPTIONS: PresetOption[] = [
  { value: '电影写实', label: '电影写实' },
  { value: '黑色电影', label: '黑色电影' },
  { value: '赛博霓虹', label: '赛博霓虹' },
  { value: '复古胶片', label: '复古胶片' },
  { value: '东方写意', label: '东方写意' },
  { value: '商业大片', label: '商业大片' },
  { value: '杂志时尚', label: '杂志时尚' },
  { value: '动作悬疑', label: '动作悬疑' },
]

export const STYLE_PALETTE_OPTIONS: PresetOption[] = [
  { value: '冷青灰', label: '冷青灰' },
  { value: '暖金棕', label: '暖金棕' },
  { value: '低饱和', label: '低饱和' },
  { value: '高反差黑金', label: '高反差黑金' },
  { value: '青橙对比', label: '青橙对比' },
  { value: '雨夜霓虹', label: '雨夜霓虹' },
  { value: '米白暗红', label: '米白暗红' },
  { value: '森林墨绿', label: '森林墨绿' },
]

export const STYLE_LIGHTING_OPTIONS: PresetOption[] = [
  { value: '柔和棚拍光', label: '柔和棚拍光' },
  { value: '窗边侧光', label: '窗边侧光' },
  { value: '轮廓边缘光', label: '轮廓边缘光' },
  { value: '雾中散射光', label: '雾中散射光' },
  { value: '夜景霓虹光', label: '夜景霓虹光' },
  { value: '顶光压迫', label: '顶光压迫' },
  { value: '局部硬光', label: '局部硬光' },
  { value: '逆光剪影', label: '逆光剪影' },
]

export const STYLE_FRAMING_OPTIONS: PresetOption[] = [
  { value: '对称构图', label: '对称构图' },
  { value: '三分法构图', label: '三分法构图' },
  { value: '居中压迫', label: '居中压迫' },
  { value: '广角纵深', label: '广角纵深' },
  { value: '浅景深主体', label: '浅景深主体' },
  { value: '前景遮挡', label: '前景遮挡' },
  { value: '压迫式留白', label: '压迫式留白' },
  { value: '长焦压缩', label: '长焦压缩' },
]

export const STYLE_QUALITY_OPTIONS: PresetOption[] = [
  { value: '电影感', label: '电影感' },
  { value: '胶片颗粒', label: '胶片颗粒' },
  { value: '超写实', label: '超写实' },
  { value: '高级肤质', label: '高级肤质' },
  { value: '材质清晰', label: '材质清晰' },
  { value: '质感克制', label: '质感克制' },
  { value: '海报级完成度', label: '海报级完成度' },
]

export const CHARACTER_TEMPERAMENT_OPTIONS: PresetOption[] = [
  { value: '冷静', label: '冷静' },
  { value: '锋利', label: '锋利' },
  { value: '温柔', label: '温柔' },
  { value: '脆弱', label: '脆弱' },
  { value: '疲惫', label: '疲惫' },
  { value: '压抑', label: '压抑' },
]

export const CHARACTER_STATE_OPTIONS: PresetOption[] = [
  { value: '湿发', label: '湿发' },
  { value: '奔跑后', label: '奔跑后' },
  { value: '狼狈', label: '狼狈' },
  { value: '整洁', label: '整洁' },
  { value: '盛装', label: '盛装' },
  { value: '受伤', label: '受伤' },
]

export function getOptionLabel<TValue extends string>(
  options: ReadonlyArray<PresetOption<TValue>>,
  value: string | undefined
): string {
  if (!value) return ''
  return options.find((option) => option.value === value)?.label ?? value
}

export function getOptionLabels<TValue extends string>(
  options: ReadonlyArray<PresetOption<TValue>>,
  values: string[] | undefined
): string[] {
  return Array.from(
    new Set(
      (values ?? [])
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => getOptionLabel(options, value.trim()))
    )
  )
}
