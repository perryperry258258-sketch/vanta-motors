'use client';

import { useEffect } from 'react';
import { site } from '../lib/site';
import { trackCar } from '../lib/track';

export default function ContactBar({ carId }) {
  useEffect(() => {
    trackCar(carId, 'view');
  }, [carId]);

  return (
    <div className="contact-bar">
      <div className="contact-bar-inner">
        <p>對這台車有興趣？</p>
        <div className="contact-buttons">
          <a href={`tel:${site.phone}`} className="btn btn-dark" onClick={() => trackCar(carId, 'phone')}>
            電話詢問
          </a>
          <a
            href={site.lineUrl}
            className="btn btn-light"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackCar(carId, 'line')}
          >
            LINE 詢問
          </a>
        </div>
      </div>
    </div>
  );
}
