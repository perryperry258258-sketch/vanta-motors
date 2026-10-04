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
// 例如「2018 Altis」→ Corolla Altis；「GTI」→ Golf GTI；「AE86」「GT86」→ 86
const MODEL_ALIASES = {
  altis: ['corollaaltis'],
  // 只寫 GTI（沒寫 Golf、Polo）時當成 Golf GTI
  gti: ['golfgti'],
  ae86: ['86'],
  gt86: ['86'],
  mustang: ['mustang'],
  crv: ['crv'],
  hrv: ['hrv'],
  // 台灣常見簡稱
  cc: ['corollacross'],
  lommel: ['focus'],
  // Honda Civic 世代代號：K8、K10、K12（第八代）、K14（第九代）
  k8: ['civic'],
  k10: ['civic'],
  k12: ['civic'],
  k14: ['civic'],
  luxgen7: ['m7'],
  // 只有在車名沒有其他車型時才會用到（例如「Variant」→ Golf Variant、「Stline」→ Focus ST-Line）
  variant: ['golfvariant'],
  stline: ['focus'],
};

// 打錯字：先在文字裡改正（例如「Gofl R」→「Golf R」，才對得到 Golf R 而不是一般 Golf）
const TYPO_FIXES = [
  [/gofl/gi, 'golf'],
  [/forcus/gi, 'focus'],
  [/elantre/gi, 'elantra'],
];

// 中文俗稱（只在車名裡出現時換成英文車型）
const ZH_ALIASES = [
  [/馬\s*[三3]/g, ' mazda3 '],
  [/馬\s*[六6]/g, ' mazda6 '],
  [/馬\s*[二2]/g, ' mazda2 '],
  [/仙草/g, ' sentra '],
];

function baseTokens(car) {
  let text = `${car.model || ''} ${car.title || ''}`;
  for (const [re, en] of [...TYPO_FIXES, ...ZH_ALIASES]) text = text.replace(re, en);
  return text
    .toLowerCase()
    .normalize('NFKD')
    // 中文與英數字黏在一起時拆開，例如「11.5代ALTIS」「AltisX白」
    .replace(/([^\x00-\x7f])/g, ' $1 ')
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
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

  // 最後一個字是單一字母的車型（Golf R、Model S）：要連續兩個字對上，
  // 避免「Golf R-Line」被當成 Golf R
  const words = String(name).toLowerCase().split(/\s+/).map(compact).filter(Boolean);
  if (words.length > 1 && words[words.length - 1].length === 1) {
    if (tokens.includes(n)) return true;
    return tokens.some((_, i) => words.every((w, j) => tokens[i + j] === w));
  }

  // 純數字車型（911、3008、2008）：要整個字一樣，而且不能是年份
  if (/^\d+$/.test(n)) return tokens.some((t) => t === n && t !== yearToken);

  // 短車型（NX、CR-V、X1）：某個字以它開頭，例如 NX350h、CRV
  if (n.length <= 3) return tokens.some((t) => t.startsWith(n));

  // 其他：整串文字包含它，例如 Corolla Cross、Model Y、Range Rover Evoque
  return joined.includes(n);
}

function findModel(sorted, tokens, yearToken) {
  const joined = tokens.join('');
  return sorted.find((m) => modelMatches(m.name, tokens, joined, yearToken)) || null;
}

// 先用車名原本的字比對；對不到才套用簡稱表，避免簡稱蓋過車名裡寫明的車型
// （例如「Kuga ST-Line」會對到 Kuga，不會因為 ST-Line 被當成 Focus）
export function matchModel(models, car) {
  const yearToken = car.year ? String(car.year) : '';
  const sorted = [...(models || [])]
    .filter((m) => m.active !== false)
    .sort((a, b) => compact(b.name).length - compact(a.name).length);
  const base = baseTokens(car);
  const direct = findModel(sorted, base, yearToken);
  if (direct) return direct;
  const extra = base.flatMap((t) => MODEL_ALIASES[t] || []);
  return extra.length ? findModel(sorted, [...base, ...extra], yearToken) : null;
}
