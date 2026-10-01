export const RULE_COLUMNS = [
  'id', 'brand', 'model', 'reference_year', 'reference_price',
  'brand_factor', 'year_factor', 'mileage_min', 'mileage_max', 'mileage_factor',
  'estimated_low', 'estimated_high',
  'market_price_low', 'market_price_high', 'buy_price_low', 'buy_price_high',
  'source', 'source_url', 'source_updated_at', 'notes', 'active',
];

export function parseCSV(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

export function toCSV(rows) {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '\uFEFF' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export function parseBool(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (s === '') return true;
  return !['false', '0', 'no', 'n', '停用', '否'].includes(s);
}
