'use client';

import Link from 'next/link';
import { useState } from 'react';
import Logo from './Logo';
import LangSwitch from './LangSwitch';
import { dict } from '../lib/i18n';
import '../styles/i18n.css';

export default function Header({ lang = 'zh' }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const t = dict[lang].nav;

  const links = [
    [`/${lang}`, t.home],
    [`/${lang}/vehicles`, t.vehicles],
    [`/${lang}#about`, t.about],
    [`/${lang}#contact`, t.contact],
  ];

  return (
    <header className="header">
      <div className="header-inner">
        <Link href={`/${lang}`} aria-label="VANTA MOTORS" onClick={close}>
          <Logo />
        </Link>
        <div className="header-right">
          <nav className="nav-desktop">
            {links.map(([href, label]) => (
              <Link key={href} href={href}>{label}</Link>
            ))}
          </nav>
          <LangSwitch lang={lang} className="lang-switch-desktop" />
          <button
            className="menu-btn"
            aria-expanded={open}
            aria-label={open ? t.closeMenu : t.openMenu}
            onClick={() => setOpen(!open)}
          >
            <span />
            <span />
          </button>
        </div>
      </div>
      {open && (
        <nav className="nav-mobile">
          {links.map(([href, label]) => (
            <Link key={href} href={href} onClick={close}>{label}</Link>
          ))}
          <LangSwitch lang={lang} />
        </nav>
      )}
    </header>
  );
}
