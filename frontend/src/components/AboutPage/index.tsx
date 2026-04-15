import './style.css'

const aboutPoem = '诗寻静语应无极，梦绕闲云未有涯。'

const aboutTags = ['AI 分镜工作台', '镜头语言', '故事板创作']

const meaningCards = [
  {
    title: '镜语 · 产品内核',
    text: '产品以“镜语”为名，强调镜头本身就是一种语言。画面可以先于对白完成叙事，让影像自己讲故事。',
  },
  {
    title: '静语 · 创作哲学',
    text: '品牌意向承接“静语”之境，提醒创作者先沉静、后表达，让镜头从喧闹中回到审美与判断，回归创作本质。',
  },
  {
    title: '分镜工作台 · 工具价值',
    text: '把角色、风格、场次、镜头、图像与视频放进同一张画布，让创意从想法变成可执行的完整分镜流程。',
  },
]

function AboutPage() {
  return (
    <div className="about-page">
      <section className="about-page-hero">
        <div className="about-page-kicker">About</div>
        <h1 className="about-page-title">镜语</h1>
        <p className="about-page-subtitle">静语为意，镜语为名</p>

        <div className="about-page-tag-list">
          {aboutTags.map((tag) => (
            <span key={tag} className="about-page-tag">
              {tag}
            </span>
          ))}
        </div>
      </section>

      <section className="about-page-grid">
        <article className="about-page-card about-page-card-quote">
          <div className="about-page-section-label">品牌由来</div>
          <blockquote className="about-page-poem">
            <p>“{aboutPoem}”</p>
          </blockquote>
          <div className="about-page-poem-source">北宋 · 林逋</div>
          <p className="about-page-card-text">
            镜语的中文名，直指镜头之语。品牌的精神底色，则取自“静语”。镜语为名，静语为意，名字里既有画面表达，也有创作前的沉静与观照。
          </p>
        </article>

        <article className="about-page-card about-page-card-intro">
          <div className="about-page-section-label">产品定位</div>
          <p className="about-page-card-text">
            镜语是一套面向 AI 分镜与镜头创作的工作台，帮助把角色设定、风格控制、故事板结构与图像视频生成放到同一条创作链路中。
          </p>
          <p className="about-page-card-text">
            它不只是在生成结果，更是在组织镜头语言，让灵感可以沉淀、复用、调整并持续演化。
          </p>
        </article>
      </section>

      <section className="about-page-card about-page-card-prose">
        <div className="about-page-section-label">文化核心</div>
        <div className="about-page-prose">
          <p>
            <strong>静语</strong>二字，取自北宋林逋诗句：
          </p>
          <p className="about-page-emphasis">诗寻静语应无极，梦绕闲云未有涯。</p>
          <p>诗以静语为境，心以闲云为归。</p>
          <p>
            <strong>静</strong>，是沉静专注，是光影无声，是创作前的沉淀与观照；
          </p>
          <p>
            <strong>语</strong>，是镜头语言，是画面叙事，是影像自身的表达与对话。
          </p>
          <p>静而不语，语自于静。</p>
          <p>以沉静之心，作光影之语；</p>
          <p>以无限之境，绘无穷之意。</p>
          <p className="about-page-emphasis">
            <strong>镜语</strong>，于静谧之中，见镜头万千言语。
          </p>
        </div>
      </section>

      <section className="about-page-card about-page-contact-card">
        <div className="about-page-contact-copy">
          <div className="about-page-section-label">联系作者</div>
          <div className="about-page-meaning-title">扫码添加个人微信</div>
          <p className="about-page-card-text">
            如果你希望交流产品想法、反馈使用体验，或沟通项目合作与定制需求，可以直接扫码联系。
          </p>
          <p className="about-page-card-text">
            建议添加时备注 <strong>镜语</strong> 或 <strong>SketchShot</strong>，方便快速识别来意。
          </p>
        </div>

        <div className="about-page-contact-qr-block">
          <img className="about-page-contact-qr" src="/chong.png" alt="个人微信二维码" loading="lazy" />
          <div className="about-page-poem-source">微信扫码联系</div>
        </div>
      </section>

      <section className="about-page-meaning-grid">
        {meaningCards.map((card) => (
          <article key={card.title} className="about-page-card about-page-meaning-card">
            <div className="about-page-meaning-title">{card.title}</div>
            <p className="about-page-card-text">{card.text}</p>
          </article>
        ))}
      </section>
    </div>
  )
}

export default AboutPage
