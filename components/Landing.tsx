"use client";
import { BRAND } from "@/lib/brand";
import Header from "./Header";
import { useLang } from "./LangProvider";
import Simulator from "./Simulator";
import VoiceAgent from "./VoiceAgent";

const ICONS = ["🧾", "💳", "↩︎", "⇄"];

export default function Landing() {
  const { t } = useLang();
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <p className="eyebrow">{t.hero.eyebrow}</p>
              <h1>{t.hero.title}</h1>
              <p className="lead">{t.hero.sub}</p>
              <div className="row gap">
                <a className="btn primary" href="#agent">{t.cta.talk}</a>
                <a className="btn" href="#simulator">{t.cta.tryIt}</a>
              </div>
              <ul className="chips static">
                {t.hero.chips.map((c) => (
                  <li key={c} className="chip">{c}</li>
                ))}
              </ul>
            </div>
            <HeroVisual />
          </div>
        </section>

        <section id="problem" className="section">
          <div className="wrap">
            <h2>{t.problem.title}</h2>
            <p className="lead narrow">{t.problem.sub}</p>
            <div className="grid-5">
              {t.problem.items.map((p, i) => (
                <article key={p.t} className="card problem">
                  <span className="idx">0{i + 1}</span>
                  <h3>{p.t}</h3>
                  <p>{p.d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="use-cases" className="section alt">
          <div className="wrap">
            <h2>{t.useCases.title}</h2>
            <div className="grid-4">
              {t.useCases.items.map((u, i) => (
                <article key={u.t} className="card usecase">
                  <span className="icon" aria-hidden>{ICONS[i]}</span>
                  <span className="tag">{u.tag}</span>
                  <h3>{u.t}</h3>
                  <p>{u.d}</p>
                </article>
              ))}
            </div>
            <h3 className="flow-title">{t.flow.title}</h3>
            <ol className="flow">
              {t.flow.steps.map((s, i) => (
                <li key={s}><span className="num">{i + 1}</span>{s}</li>
              ))}
            </ol>
          </div>
        </section>

        <section id="simulator" className="section">
          <div className="wrap">
            <h2>{t.sim.title}</h2>
            <p className="lead narrow">{t.sim.sub}</p>
            <Simulator />
          </div>
        </section>

        <section id="agent" className="section alt">
          <div className="wrap agent-grid">
            <div>
              <h2>{t.agent.title}</h2>
              <p className="lead">{t.agent.sub}</p>
              <ul className="principles">
                <li>{t.agent.consentNote}</li>
              </ul>
            </div>
            <VoiceAgent />
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <p><b>{BRAND}</b> · {t.footer.note}</p>
          <p className="small muted">{t.footer.privacy}</p>
        </div>
      </footer>
    </>
  );
}

function HeroVisual() {
  const { lang } = useLang();
  const es = lang === "es";
  return (
    <div className="hero-visual" aria-hidden>
      <div className="mock invoice-mock">
        <div className="row-between"><b>F-2026-001851</b><span className="pill ota">OTA</span></div>
        <p className="muted small">Booking.com B.V. · VCC</p>
        <div className="row-between"><span>{es ? "Alojamiento 2 noches" : "Accommodation 2 nights"}</span><b>280,00 €</b></div>
      </div>
      <div className="mock invoice-mock second">
        <div className="row-between"><b>F-2026-001852</b><span className="pill guest">{es ? "Huésped" : "Guest"}</span></div>
        <p className="muted small">Tom Becker</p>
        <div className="row-between"><span>{es ? "Parking + minibar + tasa" : "Parking + minibar + tax"}</span><b>56,50 €</b></div>
      </div>
      <div className="mock voice-mock">
        <span className="wave"><i /><i /><i /><i /><i /></span>
        <p>{es ? "“Confirmo: B de Barcelona, 87, 45, 21, 08. ¿Es correcto?”" : "“Confirming: B for Barcelona, 87, 45, 21, 08. Is that right?”"}</p>
      </div>
    </div>
  );
}
