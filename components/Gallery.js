'use client';

import { useRef, useState } from 'react';

const DEFAULT_LABELS = { photo: '照片', prev: '上一張', next: '下一張' };

export default function Gallery({ photos, title, labels = DEFAULT_LABELS }) {
  const track = useRef(null);
  const [index, setIndex] = useState(0);

  function onScroll() {
    const el = track.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  function go(i) {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }

  return (
    <div className="gallery">
      <div className="gallery-track" ref={track} onScroll={onScroll}>
        {photos.map((src, i) => (
          <div className="gallery-slide" key={src + i}>
            <img src={src} alt={`${title} ${labels.photo} ${i + 1}`} loading={i === 0 ? 'eager' : 'lazy'} />
          </div>
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <button className="gallery-arrow prev" onClick={() => go(index - 1)} disabled={index === 0} aria-label={labels.prev}>‹</button>
          <button className="gallery-arrow next" onClick={() => go(index + 1)} disabled={index === photos.length - 1} aria-label={labels.next}>›</button>
          <div className="gallery-count">{index + 1} / {photos.length}</div>
        </>
      )}
    </div>
  );
}
