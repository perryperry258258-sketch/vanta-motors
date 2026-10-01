const BRANDS = [
  ['Mercedes-Benz', ['mercedes-benz', 'mercedes benz', 'mercedes', 'benz', '賓士']],
  ['BMW', ['bmw', '寶馬']],
  ['Toyota', ['toyota', '豐田']],
  ['Lexus', ['lexus', '凌志']],
  ['Honda', ['honda', '本田']],
  ['Nissan', ['nissan', '日產']],
  ['Mazda', ['mazda', '馬自達']],
  ['Mitsubishi', ['mitsubishi', '三菱']],
  ['Subaru', ['subaru', '速霸陸']],
  ['Suzuki', ['suzuki', '鈴木']],
  ['Volkswagen', ['volkswagen', 'vw', '福斯']],
  ['Audi', ['audi', '奧迪']],
  ['Porsche', ['porsche', '保時捷']],
  ['Volvo', ['volvo', '富豪']],
  ['Ford', ['ford', '福特']],
  ['Hyundai', ['hyundai', '現代']],
  ['Kia', ['kia', '起亞']],
  ['Skoda', ['skoda', '斯柯達']],
  ['Peugeot', ['peugeot', '寶獅']],
  ['MINI', ['mini']],
  ['Land Rover', ['land rover', 'landrover', '荒原路華', '路華']],
  ['Jaguar', ['jaguar', '捷豹']],
  ['Tesla', ['tesla', '特斯拉']],
  ['Infiniti', ['infiniti', '極致']],
  ['Luxgen', ['luxgen', '納智捷']],
  ['Jeep', ['jeep']],
  ['Chevrolet', ['chevrolet', '雪佛蘭']],
  ['Maserati', ['maserati', '瑪莎拉蒂']],
  ['Ferrari', ['ferrari', '法拉利']],
  ['Lamborghini', ['lamborghini', '藍寶堅尼']],
  ['Bentley', ['bentley', '賓利']],
  ['Alfa Romeo', ['alfa romeo', '愛快']],
  ['Citroën', ['citroen', 'citroën', '雪鐵龍']],
  ['Renault', ['renault', '雷諾']],
];

function isWordChar(ch) {
  return !!ch && /[a-z0-9]/i.test(ch);
}

function findBrand(text) {
  const lower = text.toLowerCase();
  let best = null;
  for (const [name, aliases] of BRANDS) {
    for (const alias of aliases) {
      let from = 0;
      let i;
      while ((i = lower.indexOf(alias, from)) !== -1) {
        const latin = /^[a-z]/.test(alias);
        const ok = !latin || (!isWordChar(lower[i - 1]) && !isWordChar(lower[i + alias.length]));
        if (ok) {
          if (!best || alias.length > best.alias.length) best = { name, alias, index: i };
          break;
        }
        from = i + 1;
      }
    }
  }
  return best;
}

// 只從文字判讀，判斷不出來就留空，不猜
export function parseTitle(input) {
  const title = String(input || '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  let rest = title;
  let year = null;

  const m = rest.match(/(?:^|\D)((?:19[89]\d|20[0-4]\d))(?!\d)/);
  if (m) {
    year = Number(m[1]);
    const at = m.index + m[0].length - 4;
    rest = rest.slice(0, at) + ' ' + rest.slice(at + 4);
  }

  let brand = null;
  const b = findBrand(rest);
  if (b) {
    brand = b.name;
    rest = rest.slice(0, b.index) + ' ' + rest.slice(b.index + b.alias.length);
  }

  let model = rest
    .replace(/年式|年份|年/g, ' ')
    .replace(/^[\s\-–_/,.]+|[\s\-–_/,.]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!brand) model = '';

  const unsure = [];
  if (!year) unsure.push('year');
  if (!brand) unsure.push('brand');
  if (!model) unsure.push('model');

  return { title, brand, model: model || null, year, unsure };
}

export function makeSlug(title) {
  const base = String(title)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  const rand = Math.random().toString(36).slice(2, 6);
  return base ? `${base}-${rand}` : `car-${rand}${Math.random().toString(36).slice(2, 6)}`;
}
