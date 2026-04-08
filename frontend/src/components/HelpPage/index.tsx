import './style.css'

const nodeRoleCards = [
  {
    title: '输入节点',
    subtitle: '给下游提供原始素材或基础约束',
    items: [
      '图片上传：提供参考图、起始图、角色图。',
      '场次：描述这一段剧情、场景、节拍。',
      '角色：沉淀人物外观、气质、服装、道具。',
      '风格：统一画面气质、色彩、光线和镜头语言。',
    ],
  },
  {
    title: '规划节点',
    subtitle: '把镜头动作和连续性先想清楚',
    items: [
      '九宫格动作：先写总提示词，再拆成 9 格连续动作。',
      '九宫格动作也可以继续生成一张九宫格预览图。',
      '当它连到镜头时，下游主要读取的是九格动作文字。',
      '当它连到图片预览或视频生成时，下游主要读取的是九宫格预览图。',
    ],
  },
  {
    title: '生成节点',
    subtitle: '真正向模型提交任务并产出结果',
    items: [
      '图片生成：根据提示词和参考图生成单张图片。',
      '镜头：更适合正式分镜链路，可生成图片或视频。',
      '视频生成：基于上游图片做图生视频。',
    ],
  },
  {
    title: '查看节点',
    subtitle: '承接结果，方便查看和比对',
    items: [
      '图片预览：查看图片生成、镜头图片、九宫格预览图。',
      '视频预览：查看视频生成或镜头视频结果。',
    ],
  },
]

const connectionGroups = [
  {
    source: '场次 / 角色 / 风格',
    targets: ['镜头', '九宫格动作'],
    note: '它们本身不直接出图，主要给镜头和九宫格动作提供上下文。',
  },
  {
    source: '图片上传',
    targets: ['图片生成', '视频生成', '角色', '镜头', '九宫格动作'],
    note: '最常见的基础输入节点。可以作为参考图、首帧图、角色图。',
  },
  {
    source: '图片生成',
    targets: ['图片预览', '视频生成', '角色', '镜头', '九宫格动作'],
    note: '适合把上一步生成的图，继续作为新的参考图或视频源图。',
  },
  {
    source: '九宫格动作',
    targets: ['镜头', '图片预览', '视频生成'],
    note: '连到镜头时传递动作规划；连到图片预览或视频生成时，依赖的是它生成出的九宫格图。',
  },
  {
    source: '镜头',
    targets: ['镜头', '图片预览', '视频预览'],
    note: '如果镜头输出类型是图片，就能连图片预览；如果输出类型是视频，就能连视频预览。镜头也能串接下一个镜头。',
  },
  {
    source: '视频生成',
    targets: ['视频预览'],
    note: '视频生成节点只负责图生视频，输出通常直接去视频预览。',
  },
]

const imageFlows = [
  {
    title: '最简单的生图链路',
    steps: ['图片上传', '图片生成', '图片预览'],
    note: '适合先用一张参考图试风格、试人物、试构图。',
  },
  {
    title: '正式分镜生图链路',
    steps: ['场次 / 角色 / 风格', '镜头（输出类型设为图片）', '图片预览'],
    note: '这是更标准的分镜工作方式，镜头节点会把场次、角色、风格一起组织成完整出图提示。',
  },
  {
    title: '九宫格辅助生图链路',
    steps: ['参考图 / 角色 / 场次 / 风格', '九宫格动作', '镜头（输出图片）', '图片预览'],
    note: '先用九格动作把连续动作想清楚，再交给镜头节点出正式分镜图。',
  },
]

const videoFlows = [
  {
    title: '直接图生视频',
    steps: ['图片上传 或 图片生成', '视频生成', '视频预览'],
    note: '最适合快速测试一张图能否转成动态片段。',
  },
  {
    title: '九宫格预览后再生视频',
    steps: ['参考图 / 角色 / 场次 / 风格', '九宫格动作', '生成九宫格图', '视频生成', '视频预览'],
    note: '这是现在最贴近人工平台操作的链路，先看九宫格图是否满意，再决定是否继续做图生视频。',
  },
  {
    title: '正式镜头视频链路',
    steps: ['场次 / 角色 / 风格 / 九宫格动作 / 参考图', '镜头（输出类型设为视频）', '视频预览'],
    note: '适合做更正式的镜头级视频生成，镜头节点会同时读取动作规划和参考图。',
  },
]

const keyRules = [
  '视频生成节点必须吃到至少一张上游图片，不能凭空直接生成视频。',
  '九宫格动作连到视频生成时，前提是你已经在九宫格节点里点过“生成九宫格图”。',
  '一个镜头节点最多只接一个九宫格动作节点，避免动作规划冲突。',
  '镜头节点之间可以串联，用来表达镜头承接关系。',
  '视频结果本身不再作为图片参考使用；如果要继续往下做，优先回到图片链路重新组织参考图。',
]

function HelpPage() {
  return (
    <div className="help-page">
      <section className="help-page-hero">
        <div className="help-page-kicker">Help</div>
        <h1 className="help-page-title">基础使用帮助</h1>
        <p className="help-page-subtitle">
          这一页专门讲清楚节点分工、连线关系，以及生图、生视频各自应该怎么走，避免画布上不知道该接谁。
        </p>
      </section>

      <section className="help-page-section">
        <div className="help-page-section-label">先理解节点分工</div>
        <div className="help-page-card-grid">
          {nodeRoleCards.map((card) => (
            <article key={card.title} className="help-page-card">
              <div className="help-page-card-title">{card.title}</div>
              <div className="help-page-card-subtitle">{card.subtitle}</div>
              <div className="help-page-list">
                {card.items.map((item) => (
                  <p key={item} className="help-page-list-item">
                    {item}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="help-page-section">
        <div className="help-page-section-label">什么可以连什么</div>
        <div className="help-page-connection-list">
          {connectionGroups.map((group) => (
            <article key={group.source} className="help-page-connection-card">
              <div className="help-page-connection-source">{group.source}</div>
              <div className="help-page-connection-arrow">→</div>
              <div className="help-page-tag-list">
                {group.targets.map((target) => (
                  <span key={target} className="help-page-tag">
                    {target}
                  </span>
                ))}
              </div>
              <p className="help-page-note">{group.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="help-page-section">
        <div className="help-page-section-label">生图逻辑流程</div>
        <div className="help-page-flow-list">
          {imageFlows.map((flow) => (
            <article key={flow.title} className="help-page-flow-card">
              <div className="help-page-flow-title">{flow.title}</div>
              <div className="help-page-flow-steps">
                {flow.steps.map((step, index) => (
                  <div key={`${flow.title}-${step}`} className="help-page-flow-step-wrap">
                    <span className="help-page-flow-step">{step}</span>
                    {index < flow.steps.length - 1 && <span className="help-page-flow-arrow">→</span>}
                  </div>
                ))}
              </div>
              <p className="help-page-note">{flow.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="help-page-section">
        <div className="help-page-section-label">生视频逻辑流程</div>
        <div className="help-page-flow-list">
          {videoFlows.map((flow) => (
            <article key={flow.title} className="help-page-flow-card">
              <div className="help-page-flow-title">{flow.title}</div>
              <div className="help-page-flow-steps">
                {flow.steps.map((step, index) => (
                  <div key={`${flow.title}-${step}`} className="help-page-flow-step-wrap">
                    <span className="help-page-flow-step">{step}</span>
                    {index < flow.steps.length - 1 && <span className="help-page-flow-arrow">→</span>}
                  </div>
                ))}
              </div>
              <p className="help-page-note">{flow.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="help-page-section">
        <div className="help-page-section-label">几个最重要的限制</div>
        <div className="help-page-rule-list">
          {keyRules.map((rule) => (
            <article key={rule} className="help-page-rule-card">
              {rule}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export default HelpPage
