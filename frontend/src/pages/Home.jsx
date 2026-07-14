import { useNavigate } from 'react-router-dom'

export default function Home() {
  const navigate = useNavigate()

  const scrollToHow = (e) => {
    e.preventDefault()
    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <main>
      {/* ---- Hero ---- */}
      <section className="home-hero">
        <div className="page-wrap home-hero-inner">
          <div className="home-hero-text">
            <p className="home-eyebrow">
              Benefits can be difficult to understand. CareCompass makes the first step simpler.
            </p>
            <h1 className="home-heading">
              Find government benefits that may fit your situation
            </h1>
            <p className="home-desc">
              Answer a few simple questions to explore health coverage, food assistance,
              family support, income programs, and help with household costs.
            </p>
            <div className="home-cta-row">
              <button
                className="btn btn-primary home-cta-btn"
                onClick={() => navigate('/questionnaire')}
              >
                Find my benefits
              </button>
              <a
                href="#how-it-works"
                className="btn btn-outline home-cta-btn"
                onClick={scrollToHow}
              >
                See how it works
              </a>
            </div>
          </div>

          {/* Right-side info card — no images, pure HTML/CSS */}
          <div className="home-info-card" aria-hidden="true">
            <p className="home-info-card-title">Programs we help you explore</p>
            <ul className="home-info-list">
              <li className="home-info-item">Health coverage</li>
              <li className="home-info-item">Food and family support</li>
              <li className="home-info-item">Income assistance</li>
              <li className="home-info-item">Household cost support</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ---- Trust row ---- */}
      <section className="home-trust" aria-label="Key facts about CareCompass">
        <div className="page-wrap home-trust-inner">
          <span className="home-trust-item">Free to use</span>
          <span className="home-trust-sep" aria-hidden="true"></span>
          <span className="home-trust-item">No account required to check</span>
          <span className="home-trust-sep" aria-hidden="true"></span>
          <span className="home-trust-item">Usually takes about 3 minutes</span>
        </div>
      </section>

      {/* ---- How it works ---- */}
      <section id="how-it-works" className="home-how" aria-labelledby="how-heading">
        <div className="page-wrap">
          <h2 id="how-heading" className="home-section-heading">How It Works</h2>
          <ol className="home-steps" role="list">
            <li className="home-step">
              <span className="home-step-num" aria-hidden="true">1</span>
              <div className="home-step-body">
                <h3 className="home-step-title">Tell us about your situation</h3>
                <p>Answer a short questionnaire about your household, income, coverage, and support needs.</p>
              </div>
            </li>
            <li className="home-step">
              <span className="home-step-num" aria-hidden="true">2</span>
              <div className="home-step-body">
                <h3 className="home-step-title">See possible programs</h3>
                <p>CareCompass compares your answers with clear, rules-based program requirements.</p>
              </div>
            </li>
            <li className="home-step">
              <span className="home-step-num" aria-hidden="true">3</span>
              <div className="home-step-body">
                <h3 className="home-step-title">Understand your results</h3>
                <p>Review plain-language explanations and visit official government application websites.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      {/* ---- Design principle ---- */}
      <section className="home-principle" aria-labelledby="principle-heading">
        <div className="page-wrap">
          <h2 id="principle-heading" className="home-section-heading">Clear rules, responsible AI</h2>
          <p className="home-principle-text">
            CareCompass uses a deterministic rules engine to identify possible programs.
            AI only explains your results and never decides whether you qualify.
          </p>
        </div>
      </section>

      {/* ---- Bottom CTA ---- */}
      <section className="home-bottom-cta">
        <div className="page-wrap home-bottom-inner">
          <button
            className="btn btn-primary home-cta-btn"
            onClick={() => navigate('/questionnaire')}
          >
            Start the questionnaire
          </button>
          <p className="home-bottom-disclaimer">
            CareCompass provides general guidance and does not make final eligibility
            decisions. Government agencies determine official eligibility.
          </p>
        </div>
      </section>
    </main>
  )
}
