"use client";
import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { LangToggle, useLang } from "./LangProvider";

export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
        <rect x="4" y="3" width="20" height="26" rx="4" fill="var(--brand)" />
        <path d="M9 10h10M9 15h10M9 20h6" stroke="var(--brand-ink)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="25" cy="23" r="5.5" fill="var(--accent)" stroke="var(--bg)" strokeWidth="2" />
      </svg>
      {BRAND}
    </span>
  );
}

export default function Header() {
  const { t } = useLang();
  return (
    <header className="site-header">
      <div className="wrap row-between">
        <Link href="/" aria-label={BRAND}>
          <Logo />
        </Link>
        <nav className="nav" aria-label="Principal">
          <a href="#problem">{t.nav.problem}</a>
          <a href="#use-cases">{t.nav.useCases}</a>
          <a href="#simulator">{t.nav.simulator}</a>
          <a href="#agent">{t.nav.agent}</a>
        </nav>
        <div className="row">
          <LangToggle />
          <a className="btn primary sm hide-sm" href="#agent">{t.cta.talk}</a>
        </div>
      </div>
    </header>
  );
}
