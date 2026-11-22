"use client";
import { useMemo, useState } from "react";
import { validateTaxId } from "@/lib/taxid";
import { track } from "@/lib/telemetry";
import { useLang } from "./LangProvider";

type Scenario = "direct" | "vcc" | "company" | "late";

interface Line {
  concept: string;
  amount: number; // IVA incluido
  vat: number | null; // null = no sujeto
  billTo: "guest" | "ota" | "company";
}

const eur = (n: number, lang: string) => new Intl.NumberFormat(lang === "en" ? "en-GB" : "es-ES", { style: "currency", currency: "EUR" }).format(n);

const PRESETS: Record<Scenario, { nights: number; rate: number; parking: boolean; minibar: boolean; cityTax: boolean; company: boolean; taxId: string; companyName: string }> = {
  direct: { nights: 3, rate: 110, parking: false, minibar: false, cityTax: true, company: false, taxId: "", companyName: "" },
  vcc: { nights: 2, rate: 140, parking: true, minibar: true, cityTax: true, company: false, taxId: "", companyName: "" },
  company: { nights: 2, rate: 156.2, parking: false, minibar: false, cityTax: false, company: true, taxId: "B87452108", companyName: "Nordic Consulting S.L." },
  late: { nights: 2, rate: 180, parking: false, minibar: false, cityTax: false, company: false, taxId: "", companyName: "" },
};

export default function Simulator() {
  const { t, lang } = useLang();
  const s = t.sim;
  const [scenario, setScenario] = useState<Scenario>("vcc");
  const [cfg, setCfg] = useState(PRESETS.vcc);
  const [run, setRun] = useState(0);

  const pick = (sc: Scenario) => {
    setScenario(sc);
    setCfg(PRESETS[sc]);
    setRun(0);
  };

  const tax = useMemo(() => (cfg.company && cfg.taxId ? validateTaxId(cfg.taxId) : null), [cfg.company, cfg.taxId]);

  const result = useMemo(() => {
    const isVcc = scenario === "vcc";
    const lines: Line[] = [
      { concept: `${s.stay} · ${cfg.nights} ${s.nightsUnit}`, amount: cfg.nights * cfg.rate, vat: 10, billTo: isVcc ? "ota" : cfg.company ? "company" : "guest" },
    ];
    if (cfg.parking) lines.push({ concept: s.parking, amount: 18 * cfg.nights, vat: 21, billTo: cfg.company ? "company" : "guest" });
    if (cfg.minibar) lines.push({ concept: s.minibar, amount: 12.5, vat: 10, billTo: cfg.company ? "company" : "guest" });
    if (cfg.cityTax) lines.push({ concept: s.cityTax, amount: 2 * cfg.nights, vat: null, billTo: cfg.company ? "company" : "guest" });

    const groups = new Map<string, Line[]>();
    for (const l of lines) {
      if (!groups.has(l.billTo)) groups.set(l.billTo, []);
      groups.get(l.billTo)!.push(l);
    }
    let seq = 1870;
    const invoices = [...groups.entries()].map(([to, ls]) => {
      const base = ls.reduce((a, l) => a + (l.vat === null ? 0 : l.amount / (1 + l.vat / 100)), 0);
      const notSubject = ls.reduce((a, l) => a + (l.vat === null ? l.amount : 0), 0);
      const total = ls.reduce((a, l) => a + l.amount, 0);
      return {
        id: `F-2026-00${seq++}`,
        to: to === "ota" ? s.toOta : to === "company" ? cfg.companyName || s.company : s.toGuest,
        lines: ls,
        base,
        vat: total - base - notSubject,
        notSubject,
        total,
      };
    });
    const invoiced = invoices.reduce((a, i) => a + i.total, 0);
    const late = scenario === "late" ? 25 : 0;
    const gateway = invoiced + late;
    const blocked = cfg.company && (!tax || !tax.valid);
    return { lines, invoices, invoiced, gateway, diff: gateway - invoiced, blocked };
  }, [cfg, scenario, s, tax]);

  const generate = () => {
    setRun((r) => r + 1);
    track({
      type: "simulator_run",
      channel: "web",
      lang,
      data: { scenario, invoices: result.invoices.length, blocked: result.blocked, mismatch: result.diff !== 0, nights: cfg.nights },
    });
  };

  const ask = () => {
    const q =
      scenario === "late"
        ? lang === "en"
          ? `The gateway charged ${result.gateway} euros but the invoice is ${result.invoiced}. Booking DQ-420. What do I do?`
          : `La pasarela cobró ${result.gateway} euros pero la factura es de ${result.invoiced}. Reserva DQ-420. ¿Qué hago?`
        : scenario === "vcc"
          ? t.scenarios[1].q
          : result.blocked
            ? t.scenarios[6].q
            : scenario === "company"
              ? t.scenarios[4].q
              : t.scenarios[2].q;
    document.getElementById("agent")?.scrollIntoView({ behavior: "smooth" });
    window.dispatchEvent(new CustomEvent("guestbill:ask", { detail: q }));
  };

  const set = <K extends keyof typeof cfg>(k: K, v: (typeof cfg)[K]) => setCfg((c) => ({ ...c, [k]: v }));

  return (
    <div className="sim">
      <form
        className="sim-form card"
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
      >
        <label className="field">
          <span>{s.scenario}</span>
          <select value={scenario} onChange={(e) => pick(e.target.value as Scenario)}>
            {(Object.keys(s.scenarios) as Scenario[]).map((k) => (
              <option key={k} value={k}>
                {s.scenarios[k]}
              </option>
            ))}
          </select>
        </label>
        <div className="grid2">
          <label className="field">
            <span>{s.nights}</span>
            <input type="number" min={1} max={30} value={cfg.nights} onChange={(e) => set("nights", Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
          </label>
          <label className="field">
            <span>{s.rate}</span>
            <input type="number" min={0} step="0.1" value={cfg.rate} onChange={(e) => set("rate", Math.max(0, Number(e.target.value) || 0))} />
          </label>
        </div>
        <fieldset className="field">
          <legend>{s.extras}</legend>
          <label className="check"><input type="checkbox" checked={cfg.parking} onChange={(e) => set("parking", e.target.checked)} /> {s.parking}</label>
          <label className="check"><input type="checkbox" checked={cfg.minibar} onChange={(e) => set("minibar", e.target.checked)} /> {s.minibar}</label>
          <label className="check"><input type="checkbox" checked={cfg.cityTax} onChange={(e) => set("cityTax", e.target.checked)} /> {s.cityTax}</label>
        </fieldset>
        {scenario !== "vcc" && (
          <fieldset className="field">
            <legend>{s.billTo}</legend>
            <div className="seg">
              <button type="button" className={!cfg.company ? "on" : ""} onClick={() => set("company", false)}>{s.person}</button>
              <button type="button" className={cfg.company ? "on" : ""} onClick={() => set("company", true)}>{s.company}</button>
            </div>
          </fieldset>
        )}
        {cfg.company && scenario !== "vcc" && (
          <>
            <label className="field">
              <span>{s.companyName}</span>
              <input value={cfg.companyName} onChange={(e) => set("companyName", e.target.value)} />
            </label>
            <label className="field">
              <span>{s.taxId}</span>
              <input value={cfg.taxId} onChange={(e) => set("taxId", e.target.value)} placeholder="B87452108" aria-describedby="taxid-state" />
              {tax && (
                <small id="taxid-state" className={tax.valid ? "ok" : "bad"}>
                  {tax.valid ? `✓ ${s.taxValid} (${tax.kind})` : `✕ ${s.taxInvalid}: ${tax.reason}`}
                </small>
              )}
            </label>
          </>
        )}
        <button className="btn primary" type="submit">{s.run}</button>
      </form>

      <div className="sim-out" aria-live="polite">
        {run === 0 ? (
          <ol className="pipeline idle">
            {Object.values(s.steps).map((st, i) => (
              <li key={i}><span className="num">{i + 1}</span>{st}</li>
            ))}
          </ol>
        ) : (
          <div className="pipeline-run" key={run}>
            <Step n={1} title={s.steps.data} state={result.blocked ? "bad" : "ok"}>
              {cfg.company ? (
                <p>{cfg.companyName || "—"} · {tax?.normalized || "—"} {tax && (tax.valid ? "✓" : "✕")}</p>
              ) : (
                <p>{scenario === "vcc" ? s.toOta + " + " + s.toGuest : s.toGuest}</p>
              )}
            </Step>
            <Step n={2} title={s.steps.folio} state="ok">
              <ul className="folio">
                {result.lines.map((l, i) => (
                  <li key={i}>
                    <span>{l.concept}</span>
                    <span className={`pill ${l.billTo}`}>{l.billTo === "ota" ? "OTA" : l.billTo === "company" ? s.company : s.toGuest}</span>
                    <b>{eur(l.amount, lang)}</b>
                  </li>
                ))}
                {scenario === "late" && (
                  <li className="late">
                    <span>{s.lateCharge}</span>
                    <span className="pill warn">TPV</span>
                    <b>{eur(25, lang)}</b>
                  </li>
                )}
              </ul>
            </Step>
            {result.blocked ? (
              <Step n={3} title={s.steps.invoices} state="bad">
                <p>{s.blocked}</p>
              </Step>
            ) : (
              <>
                <Step n={3} title={s.steps.invoices} state="ok">
                  <div className="invoices">
                    {result.invoices.map((inv) => (
                      <div className="invoice" key={inv.id}>
                        <div className="inv-head">
                          <b>{inv.id}</b>
                          <span>{inv.to}</span>
                        </div>
                        <dl>
                          <dt>{s.base}</dt><dd>{eur(inv.base, lang)}</dd>
                          <dt>{s.vat}</dt><dd>{eur(inv.vat, lang)}</dd>
                          {inv.notSubject > 0 && (<><dt>{s.notSubject}</dt><dd>{eur(inv.notSubject, lang)}</dd></>)}
                          <dt className="tot">{s.total}</dt><dd className="tot">{eur(inv.total, lang)}</dd>
                        </dl>
                      </div>
                    ))}
                  </div>
                </Step>
                <Step n={4} title={s.steps.delivery} state="ok">
                  <p>{s.sentBy}</p>
                </Step>
                <Step n={5} title={s.steps.recon} state={result.diff === 0 ? "ok" : "warn"}>
                  <dl className="recon">
                    <dt>{s.gateway}</dt><dd>{eur(result.gateway, lang)}</dd>
                    <dt>{s.invoiced}</dt><dd>{eur(result.invoiced, lang)}</dd>
                    <dt>{s.diff}</dt><dd className={result.diff ? "bad" : "ok"}>{eur(result.diff, lang)}</dd>
                  </dl>
                  <p>{result.diff === 0 ? s.matched : `${s.mismatch} ${s.ticket} TCK-4207 · ${s.gateway} ${eur(result.gateway, lang)} · ${s.invoiced} ${eur(result.invoiced, lang)} · ${s.diff} ${eur(result.diff, lang)}`}</p>
                </Step>
              </>
            )}
            <button className="btn" onClick={ask}>{s.askAgent} →</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ n, title, state, children }: { n: number; title: string; state: "ok" | "warn" | "bad"; children: React.ReactNode }) {
  const icon = state === "ok" ? "✓" : state === "warn" ? "!" : "✕";
  return (
    <section className={`step ${state}`} style={{ animationDelay: `${(n - 1) * 140}ms` }}>
      <header>
        <span className="num" aria-hidden>{icon}</span>
        <h4>
          {n}. {title}
        </h4>
      </header>
      {children}
    </section>
  );
}
