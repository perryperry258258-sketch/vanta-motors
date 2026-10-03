// 把在售車輛的品牌／車型，對應到行情資料庫的品牌／車型（純函式，可測試）
// 例如「2021 BMW 320i」→ BMW｜3 Series；「Mercedes-Benz C300」→ Mercedes-Benz｜C-Class
// 對不上就回傳 null，不會亂猜

const compact = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const BRAND_ALIASES = {
  benz: 'mercedesbenz',
  mercedes: 'mercedesbenz',
  vw: 'volkswagen',
  landrover: 'landrover',
  citroen: 'citroen',
};

function brandKey(name) {
  const k = compact(String(name || '').normalize('NFKD'));
  return BRAND_ALIASES[k] || k;
}

export function matchBrand(brands, car) {
  const key = brandKey(car.brand);
  if (key) {
    const hit = (brands || []).find((b) => brandKey(b.name) === key);
    if (hit) return hit;
  }
  const text = compact(String(car.title || '').normalize('NFKD'));
  return (brands || [])
    .filter((b) => brandKey(b.name).length >= 3 && text.includes(brandKey(b.name)))
    .sort((a, b) => brandKey(b.name).length - brandKey(a.name).length)[0] || null;
}

// 台灣常用的車型簡稱 → 行情資料庫的車型名稱（壓縮後）
// 例如「2018 Altis」→ Corolla Altis；「Golf GTI」「GTI」→ Golf；「AE86」「GT86」→ 86
const MODEL_ALIASES = {
  altis: ['corollaaltis'],
  gti: ['golf'],
  golfgti: ['golf'],
  golfr: ['golf'],
  ae86: ['86'],
  gt86: ['86'],
  mustang: ['mustang'],
  crv: ['crv'],
  hrv: ['hrv'],
  // 台灣常見簡稱與打錯字
  cc: ['corollacross'],
  forcus: ['focus'],
  lommel: ['focus'],
  gofl: ['golf'],
  elantre: ['elantra'],
  // Honda Civic 世代代號：K8、K10、K12（第八代）、K14（第九代）
  k8: ['civic'],
  k10: ['civic'],
  k12: ['civic'],
  k14: ['civic'],
  luxgen7: ['m7'],
};

// 中文俗稱（只在車名裡出現時換成英文車型）
const ZH_ALIASES = [
  [/馬\s*[三3]/g, ' mazda3 '],
  [/馬\s*[六6]/g, ' mazda6 '],
  [/馬\s*[二2]/g, ' mazda2 '],
  [/仙草/g, ' sentra '],
];

function tokensOf(car) {
  let text = `${car.model || ''} ${car.title || ''}`;
  for (const [re, en] of ZH_ALIASES) text = text.replace(re, en);
  const base = text
    .toLowerCase()
    .normalize('NFKD')
    // 中文與英數字黏在一起時拆開，例如「11.5代ALTIS」「AltisX白」
    .replace(/([^\x00-\x7f])/g, ' $1 ')
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
  const extra = base.flatMap((t) => MODEL_ALIASES[t] || []);
  return [...base, ...extra];
}

function modelMatches(name, tokens, joined, yearToken) {
  const n = compact(name);
  if (!n) return false;

  // Mercedes-Benz：C-Class ↔ C200、C300、E250、S500
  const cls = String(name).replace(/\s+/g, '').match(/^([a-z]{1,3})-?class$/i);
  if (cls) {
    const re = new RegExp(`^${cls[1].toLowerCase()}\\d{2,3}[a-z]*$`);
    return tokens.some((t) => re.test(t)) || joined.includes(n);
  }

  // BMW：3 Series ↔ 320i、330e、M340i
  const ser = String(name).match(/^(\d)\s*series$/i);
  if (ser) {
    const re = new RegExp(`^m?${ser[1]}\\d\\d[a-z]*$`);
    return tokens.some((t) => re.test(t)) || joined.includes(n);
  }

  // 純數字車型（911、3008、2008）：要整個字一樣，而且不能是年份
  if (/^\d+$/.test(n)) return tokens.some((t) => t === n && t !== yearToken);

  // 短車型（NX、CR-V、X1）：某個字以它開頭，例如 NX350h、CRV
  if (n.length <= 3) return tokens.some((t) => t.startsWith(n));

  // 其他：整串文字包含它，例如 Corolla Cross、Model Y、Range Rover Evoque
  return joined.includes(n);
}

export function matchModel(models, car) {
  const tokens = tokensOf(car);
  const joined = tokens.join('');
  const yearToken = car.year ? String(car.year) : '';
  const sorted = [...(models || [])]
    .filter((m) => m.active !== false)
    .sort((a, b) => compact(b.name).length - compact(a.name).length);
  return sorted.find((m) => modelMatches(m.name, tokens, joined, yearToken)) || null;
}
