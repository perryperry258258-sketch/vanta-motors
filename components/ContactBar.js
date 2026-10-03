'use client';

import { useEffect } from 'react';
import { site } from '../lib/site';
import { dict } from '../lib/i18n';
import { trackCar } from '../lib/track';
import { carRef } from '../lib/case';

const LABELS = {
  zh: { ask: '詢問這台車', visit: '預約看車' },
  en: { ask: 'Ask About This Car', visit: 'Book a Visit' },
};

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

function lineLink(message) {
  return site.lineOaId
    ? `https://line.me/R/oaMessage/${encodeURIComponent(site.lineOaId)}/?${encodeURIComponent(message)}`
    : site.lineUrl;
}

export default function ContactBar({ carId, title = '', lang = 'zh' }) {
  const t = dict[lang].car;
  const L = LABELS[lang] || LABELS.zh;

  useEffect(() => {
    trackCar(carId, 'view');
  }, [carId]);

  const ref = carRef(carId);
  // 車輛編號讓 LINE 自動建立這台車的案件；勾選項目可由客戶自行修改
  const askMessage =
    lang === 'en'
      ? `Hello, I'd like to ask about this vehicle:\n${title}\nRef: ${ref}\n\nI'd like to know about:\n□ Condition\n□ Price\n□ Mileage\n□ Booking a viewing\n□ Other`
      : `您好，我想詢問這台車：\n${title}\n車輛編號：${ref}\n\n想了解：\n□ 車況\n□ 價格\n□ 里程\n□ 預約看車\n□ 其他`;
  const visitMessage =
    lang === 'en'
      ? `Hello, I'd like to book a viewing:\n${title}\nRef: ${ref}\nPreferred date:\nPreferred time:`
      : `您好，我想預約看車：\n${title}\n車輛編號：${ref}\n希望日期：\n希望時段：`;

  const onClick = () => {
    trackCar(carId, 'line');
    inquiryOnce(carId, lang);
  };

  return (
    <div className="contact-bar">
      <div className="contact-bar-inner">
        <p>{t.interested}</p>
        <div className="contact-buttons">
          <a href={lineLink(askMessage)} className="btn btn-dark" target="_blank" rel="noopener noreferrer" onClick={onClick}>
            {L.ask}
          </a>
          <a href={lineLink(visitMessage)} className="btn btn-light" target="_blank" rel="noopener noreferrer" onClick={onClick}>
            {L.visit}
          </a>
        </div>
      </div>
    </div>
  );
}
