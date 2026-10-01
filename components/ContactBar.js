'use client';

import { useEffect } from 'react';
import { site } from '../lib/site';
import { dict } from '../lib/i18n';
import { trackCar } from '../lib/track';

export default function ContactBar({ carId, lang = 'zh' }) {
  const t = dict[lang].car;

  useEffect(() => {
    trackCar(carId, 'view');
  }, [carId]);

  return (
    <div className="contact-bar">
      <div className="contact-bar-inner">
        <p>{t.interested}</p>
        <div className="contact-buttons contact-buttons-single">
          <a
            href={site.lineUrl}
            className="btn btn-dark"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackCar(carId, 'line')}
          >
            {t.line}
          </a>
        </div>
      </div>
    </div>
  );
}
