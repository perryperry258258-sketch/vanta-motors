import { NextResponse } from 'next/server';

const LOCALES = ['zh', 'en'];

function pickLang(req) {
  const saved = req.cookies.get('lang')?.value;
  if (LOCALES.includes(saved)) return saved;
  const al = (req.headers.get('accept-language') || '').toLowerCase();
  const zh = al.indexOf('zh');
  const en = al.indexOf('en');
  if (en !== -1 && (zh === -1 || en < zh)) return 'en';
  return 'zh';
}

export function middleware(req) {
  const { pathname } = req.nextUrl;
  const first = pathname.split('/')[1];

  if (LOCALES.includes(first)) {
    const res = NextResponse.next();
    res.cookies.set('lang', first, { path: '/', maxAge: 60 * 60 * 24 * 365 });
    return res;
  }

  let rest = pathname === '/' ? '' : pathname;
  if (rest === '/cars' || rest.startsWith('/cars/')) rest = rest.replace(/^\/cars/, '/vehicles');

  const url = req.nextUrl.clone();
  url.pathname = `/${pickLang(req)}${rest}`;
  return NextResponse.redirect(url, rest ? 308 : 307);
}

export const config = {
  matcher: ['/((?!_next|admin|api|.*\\..*).*)'],
};
