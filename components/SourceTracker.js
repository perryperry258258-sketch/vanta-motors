'use client';

import { useEffect } from 'react';
import { detectSource, SOURCE_COOKIE, SOURCE_DAYS } from '../lib/source';

// 記錄客人從哪裡來（IG、FB、Google…）：判斷得出來源時存 30 天，直接打網址進來不覆蓋原本的來源
export default function SourceTracker() {
  useEffect(() => {
    try {
      const s = detectSource(window.location.search, document.referrer, window.location.hostname);
      if (!s) return;
      const value = encodeURIComponent(JSON.stringify({ ...s, at: new Date().toISOString() }));
      document.cookie = `${SOURCE_COOKIE}=${value}; path=/; max-age=${SOURCE_DAYS * 86400}; SameSite=Lax`;
    } catch {
      // 無法寫入 cookie 時略過，不影響網站使用
    }
  }, []);
  return null;
}
