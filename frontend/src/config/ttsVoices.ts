/**
 * 火山引擎"豆包语音合成模型 2.0"音色清单（uranus_bigtts 后缀）。
 *
 * 数据源：API接口文档/音色列表.md 第 6-82 行
 * 仅收录 uranus 系列（当前后端 TTS 链路验证稳定的资源）。
 * saturn_*_tob 系列虽同属 2.0，但走不同资源 ID，未纳入。
 *
 * 此文件被 TTSNode、DigitalHumanNode 共享消费，扩展音色只需改这里。
 */

export interface TTSVoiceItem {
  value: string
  label: string
}

export interface TTSVoiceGroup {
  /** antd Select 分组标题 */
  label: string
  options: TTSVoiceItem[]
}

/** 默认音色：标准女声小何 2.0 */
export const DEFAULT_TTS_VOICE = 'zh_female_xiaohe_uranus_bigtts'

/**
 * 按场景分组的音色列表（antd Select 原生支持嵌套结构，自动渲染分组）。
 */
export const TTS_VOICE_GROUPS: TTSVoiceGroup[] = [
  {
    label: '通用场景',
    options: [
      { value: 'zh_female_xiaohe_uranus_bigtts', label: '小何 2.0（标准女声）' },
      { value: 'zh_female_vv_uranus_bigtts', label: 'Vivi 2.0（活泼女声）' },
      { value: 'zh_male_m191_uranus_bigtts', label: '云舟 2.0（标准男声）' },
      { value: 'zh_male_taocheng_uranus_bigtts', label: '小天 2.0（阳光男声）' },
      { value: 'zh_male_liufei_uranus_bigtts', label: '刘飞 2.0（沉稳男声）' },
      { value: 'zh_male_sophie_uranus_bigtts', label: '魅力苏菲 2.0（磁性男声）' },
      { value: 'zh_female_qingxinnvsheng_uranus_bigtts', label: '清新女声 2.0' },
      { value: 'zh_female_tianmeixiaoyuan_uranus_bigtts', label: '甜美小源 2.0' },
      { value: 'zh_female_tianmeitaozi_uranus_bigtts', label: '甜美桃子 2.0' },
      { value: 'zh_female_shuangkuaisisi_uranus_bigtts', label: '爽快思思 2.0' },
      { value: 'zh_female_linjianvhai_uranus_bigtts', label: '邻家女孩 2.0' },
      { value: 'zh_male_shaonianzixin_uranus_bigtts', label: '少年梓辛 2.0（Brayan）' },
      { value: 'zh_female_meilinvyou_uranus_bigtts', label: '魅力女友 2.0' },
    ],
  },
  {
    label: '角色扮演',
    options: [
      { value: 'zh_female_cancan_uranus_bigtts', label: '知性灿灿 2.0' },
      { value: 'zh_female_sajiaoxuemei_uranus_bigtts', label: '撒娇学妹 2.0' },
    ],
  },
  {
    label: '视频配音',
    options: [
      { value: 'zh_female_peiqi_uranus_bigtts', label: '佩奇猪 2.0（可爱角色）' },
      { value: 'zh_male_sunwukong_uranus_bigtts', label: '猴哥 2.0（孙悟空）' },
      { value: 'zh_male_dayi_uranus_bigtts', label: '大壹 2.0' },
      { value: 'zh_female_mizai_uranus_bigtts', label: '黑猫侦探社咪仔 2.0' },
      { value: 'zh_female_jitangnv_uranus_bigtts', label: '鸡汤女 2.0' },
      { value: 'zh_female_liuchangnv_uranus_bigtts', label: '流畅女声 2.0' },
      { value: 'zh_male_ruyayichen_uranus_bigtts', label: '儒雅逸辰 2.0（儒雅男声）' },
    ],
  },
  {
    label: '教育场景',
    options: [
      { value: 'zh_female_yingyujiaoxue_uranus_bigtts', label: 'Tina 老师 2.0（中英）' },
    ],
  },
  {
    label: '客服场景',
    options: [
      { value: 'zh_female_kefunvsheng_uranus_bigtts', label: '暖阳女声 2.0' },
    ],
  },
  {
    label: '有声阅读',
    options: [
      { value: 'zh_female_xiaoxue_uranus_bigtts', label: '儿童绘本 2.0' },
    ],
  },
  {
    label: '多语种（英文）',
    options: [
      { value: 'en_male_tim_uranus_bigtts', label: 'Tim（美式英语 男）' },
      { value: 'en_female_dacey_uranus_bigtts', label: 'Dacey（美式英语 女）' },
      { value: 'en_female_stokie_uranus_bigtts', label: 'Stokie（美式英语 女）' },
    ],
  },
]

/**
 * 扁平化的全部音色（用于查找/校验，例如根据 value 反查 label）。
 */
export const TTS_VOICE_FLAT: TTSVoiceItem[] = TTS_VOICE_GROUPS.flatMap((g) => g.options)

// ------------------------------------------------------------------
// Voice cloning types
// ------------------------------------------------------------------

export interface ClonedVoiceItem {
  voice_id: string
  name: string
  created_at: number
}

export interface VoiceCloneRequest {
  audio_base64: string
  audio_mime_type?: string
  name: string
}

export interface VoiceCloneResponse {
  voice_id: string
  name: string
  created_at: number
}

export interface ClonedVoiceListResponse {
  voices: ClonedVoiceItem[]
}
