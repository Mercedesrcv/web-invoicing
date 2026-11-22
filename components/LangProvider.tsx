"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { DICTS, type Dict, type Lang } from "@/lib/i18n";

const Ctx = createContext<{ lang: Lang; t: Dict; setLang: (l: Lang) => void }>({ lang: "es", t: DICTS.es, setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");

  useEffect(() => {
    let initial: Lang = "es";
    try {
      const saved = localStorage.getItem("guestbill.lang");
      if (saved === "es" || saved === "en") initial = saved;
      else if (!navigator.language.toLowerCase().startsWith("es")) initial = "en";
    } catch {
      /* sin almacenamiento */
    }
    setLangState(initial);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("guestbill.lang", l);
    } catch {
      /* ignore */
    }
  };

  return <Ctx.Provider value={{ lang, t: DICTS[lang], setLang }}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-toggle" role="group" aria-label="Idioma / Language">
      {(["es", "en"] as const).map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
