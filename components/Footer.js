import { LogoMark } from './Logo';
import LangSwitch from './LangSwitch';
import { site } from '../lib/site';
import SourceTracker from './SourceTracker';

export default function Footer({ lang }) {
  return (
    <footer className="footer">
      <SourceTracker />
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
          <a href={site.lineUrl} target="_blank" rel="noopener noreferrer">LINE {site.lineId}</a>
          {site.instagramUrl && (
            <>
              <span aria-hidden="true">|</span>
              <a href={site.instagramUrl} target="_blank" rel="noopener noreferrer">Instagram</a>
            </>
          )}
          {site.facebookUrl && (
            <>
              <span aria-hidden="true">|</span>
              <a href={site.facebookUrl} target="_blank" rel="noopener noreferrer">Facebook</a>
            </>
          )}
        </p>
        <p className="footer-links">
          <a href={`/${lang}/service`}>{lang === 'en' ? 'Service Terms' : '服務說明'}</a>
          <span aria-hidden="true">|</span>
          <a href={`/${lang}/privacy`}>{lang === 'en' ? 'Privacy Policy' : '隱私權政策'}</a>
        </p>
        <p className="footer-tagline">Pre-Owned Vehicles in Taiwan</p>
        <p className="footer-copy">© {new Date().getFullYear()} VANTA MOTORS</p>
      </div>
    </footer>
  );
        }
