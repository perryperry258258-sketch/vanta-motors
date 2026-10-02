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

function tokensOf(car) {
  return `${car.model || ''} ${car.title || ''}`
    .toLowerCase()
    .normalize('NFKD')
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
