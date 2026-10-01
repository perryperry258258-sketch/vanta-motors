'use client';

import { usePathname } from 'next/navigation';

export default function LangSwitch({ lang, long = false, className = '' }) {
  const pathname = usePathname() || '/';
  const target = (l) =>
    /^\/(zh|en)(\/|$)/.test(pathname) ? pathname.replace(/^\/(zh|en)/, `/${l}`) : `/${l}`;

  return (
    <div className={`lang-switch ${className}`}>
      <a href={target('zh')} hrefLang="zh-Hant-TW" lang="zh-Hant-TW" aria-current={lang === 'zh' ? 'true' : undefined}>
        繁中
      </a>
      <span aria-hidden="true">|</span>
      <a href={target('en')} hrefLang="en" lang="en" aria-current={lang === 'en' ? 'true' : undefined}>
        {long ? 'English' : 'EN'}
      </a>
    </div>
  );
}
