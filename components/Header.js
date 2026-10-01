'use client';

import Link from 'next/link';
import { useState } from 'react';
import Logo from './Logo';

const links = [
  ['/', '首頁'],
  ['/cars', '在售車輛'],
  ['/#about', '關於我們'],
  ['/#contact', '聯絡我們'],
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="header">
      <div className="header-inner">
        <Link href="/" aria-label="VANTA MOTORS 首頁" onClick={close}>
          <Logo />
        </Link>
        <nav className="nav-desktop">
          {links.map(([href, label]) => (
            <Link key={href} href={href}>{label}</Link>
          ))}
        </nav>
        <button
          className="menu-btn"
          aria-expanded={open}
          aria-label={open ? '關閉選單' : '開啟選單'}
          onClick={() => setOpen(!open)}
        >
          <span />
          <span />
        </button>
      </div>
      {open && (
        <nav className="nav-mobile">
          {links.map(([href, label]) => (
            <Link key={href} href={href} onClick={close}>{label}</Link>
          ))}
        </nav>
      )}
    </header>
  );
}
