import { LogoMark } from './Logo';
import LangSwitch from './LangSwitch';
import { site } from '../lib/site';
import { dict } from '../lib/i18n';

export default function Footer({ lang }) {
  const t = dict[lang].footer;
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <LogoMark size={22} />
          <div>
            <strong>VANTA MOTORS</strong>
            <p className="footer-region">Taiwan</p>
          </div>
        </div>
        <LangSwitch lang={lang} long />
        <p className="footer-links">
          <a href={`tel:${site.phone}`}>{t.call} {site.phoneDisplay}</a>
          <span aria-hidden="true">|</span>
          <a href={site.lineUrl} target="_blank" rel="noopener noreferrer">LINE</a>
          {site.instagramUrl && (
            <>
              <span aria-hidden="true">|</span>
              <a href={site.instagramUrl} target="_blank" rel="noopener noreferrer">Instagram</a>
            </>
          )}
        </p>
        <p className="footer-tagline">Pre-Owned Vehicles in Taiwan</p>
        <p className="footer-copy">© {new Date().getFullYear()} VANTA MOTORS</p>
      </div>
    </footer>
  );
}
