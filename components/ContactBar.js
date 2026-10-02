'use client';

import { useEffect } from 'react';
import { site } from '../lib/site';
import { dict } from '../lib/i18n';
import { trackCar } from '../lib/track';
import { carRef } from '../lib/case';

function inquiryOnce(carId, lang) {
  try {
    const key = `vanta:inquiry:${carId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    // 無法使用 sessionStorage 時照常送出
  }
  fetch('/api/inquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ carId, lang }),
    keepalive: true,
  }).catch(() => {});
}

export default function ContactBar({ carId, title = '', lang = 'zh' }) {
  const t = dict[lang].car;

  useEffect(() => {
    trackCar(carId, 'view');
  }, [carId]);

  const ref = carRef(carId);
  const message =
    lang === 'en'
      ? `Hello, I'm interested in this vehicle: ${title} (Ref ${ref})`
      : `您好，我想詢問這台車：${title}（車輛編號 ${ref}）`;
  const href = site.lineOaId
    ? `https://line.me/R/oaMessage/${encodeURIComponent(site.lineOaId)}/?${encodeURIComponent(message)}`
    : site.lineUrl;

  return (
    <div className="contact-bar">
      <div className="contact-bar-inner">
        <p>{t.interested}</p>
        <div className="contact-buttons contact-buttons-single">
          <a
            href={href}
            className="btn btn-dark"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              trackCar(carId, 'line');
              inquiryOnce(carId, lang);
            }}
          >
            {t.line}
          </a>
        </div>
      </div>
    </div>
  );
}
