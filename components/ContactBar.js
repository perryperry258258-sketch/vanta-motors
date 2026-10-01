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
        <div className="contact-buttons">
          <a href={`tel:${site.phone}`} className="btn btn-dark" onClick={() => trackCar(carId, 'phone')}>
            {t.call}
          </a>
          <a
            href={site.lineUrl}
            className="btn btn-light"
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
