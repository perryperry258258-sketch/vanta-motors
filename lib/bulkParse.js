// 批次上架：從電腦資料夾名稱整理車輛資料（純函式，可測試）
// 資料夾結構：VANTA 車源 / 品牌（中文）/ 車輛資料夾（例如「2018 Altis 白 豪華」）/ 照片

export const BRAND_ZH = {
  豐田: 'Toyota', 本田: 'Honda', 日產: 'Nissan', 裕隆: 'Nissan', 三菱: 'Mitsubishi', 中華: 'Mitsubishi',
  凌志: 'Lexus', 納智捷: 'Luxgen', 馬自達: 'Mazda', 現代: 'Hyundai', 起亞: 'Kia', 福特: 'Ford', 野馬: 'Ford',
  福斯: 'Volkswagen', 斯科達: 'Skoda', 鈴木: 'Suzuki', 速霸陸: 'Subaru', 賓士: 'Mercedes-Benz', 寶馬: 'BMW',
  奧迪: 'Audi', 保時捷: 'Porsche', 富豪: 'Volvo', 特斯拉: 'Tesla', 標緻: 'Peugeot', 雪鐵龍: 'Citroen',
  迷你: 'MINI', 路華: 'Land Rover', 捷豹: 'Jaguar', 吉普: 'Jeep', 無限: 'Infiniti', 極致: 'Infiniti',
  瑪莎拉蒂: 'Maserati', 法拉利: 'Ferrari', 藍寶堅尼: 'Lamborghini', 賓利: 'Bentley', 勞斯萊斯: 'Rolls-Royce',
  雷諾: 'Renault', 飛雅特: 'Fiat', 雪佛蘭: 'Chevrolet', 大發: 'Daihatsu', 比亞迪: 'BYD', 極星: 'Polestar',
};

// 品牌資料夾有預設車型的（例如「野馬」資料夾都是 Mustang）
const BRAND_DEFAULT_MODEL = { 野馬: 'Mustang' };

// 英文品牌的其他寫法
const BRAND_EXTRA = { 'Mercedes-Benz': ['Benz', 'Mercedes'], Volkswagen: ['VW'], 'Land Rover': ['LandRover'] };

const COLORS = ['珍珠白', '珍珠黑', '鐵灰', '香檳', '咖啡', '白', '黑', '銀', '灰', '紅', '藍', '綠', '黃', '橘', '棕', '金', '紫'];
const IMAGE_RE = /\.(jpe?g|png|webp|heic)$/i;
// Mac 複製到隨身碟或 Windows 時會多出「._IMG_4446.JPG」這種隱藏檔，不是照片，要略過
const isPhoto = (name) => IMAGE_RE.test(name) && !name.startsWith('.');

const num = (s) => Number(String(s).replace(/,/g, ''));
const hasCJK = (s) => /[\u3400-\u9fff]/.test(s);

// 檔名依數字排序（_2 在 _10 前面）
export function sortPhotos(names) {
  return [...names].filter(isPhoto).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function parseCar(brandFolder, carFolder, fileNames = []) {
  const brand = BRAND_ZH[brandFolder.trim()] || (/^[A-Za-z]/.test(brandFolder) ? brandFolder.trim() : '');
  let s = ` ${carFolder.replace(/[_＿]/g, ' ').replace(/\s+/g, ' ')} `;
  const notes = [];

  // 年份：2018、2016年
  let year = null;
  const y = s.match(/(?:^|\s)((?:19|20)\d{2})\s*年?/);
  if (y) {
    year = Number(y[1]);
    s = s.replace(y[0], ' ');
  }

  // 開價：資料夾或照片檔名裡的「開價38萬」「售價38.8萬」
  let price = null;
  const priceRe = /(?:開價|售價|價格|賣)\s*(\d+(?:\.\d+)?)\s*萬/;
  const pFolder = s.match(priceRe);
  if (pFolder) {
    price = num(pFolder[1]);
    s = s.replace(pFolder[0], ' ');
  } else {
    const fromFile = fileNames.map((f) => f.match(priceRe)).find(Boolean);
    if (fromFile) price = num(fromFile[1]);
  }

  // 里程：剩下的「7萬」「4.5萬」「68000km」視為公里數
  let mileage = null;
  const km = s.match(/(\d+(?:\.\d+)?)\s*萬\s*(?:km|公里)?/i) || s.match(/(\d{4,6})\s*(?:km|公里)/i);
  if (km) {
    mileage = km[0].includes('萬') ? Math.round(num(km[1]) * 10000) : num(km[1]);
    s = s.replace(km[0], ' ');
    if (mileage > 600000) {
      notes.push('里程看起來不合理，請確認');
    }
  }

  // 顏色
  let color = null;
  for (const c of COLORS) {
    if (s.includes(c)) {
      color = c;
      s = s.replace(c, ' ');
      break;
    }
  }

  // 資料夾名稱裡重複的品牌（例如「2012 Toyota 86」）拿掉，避免變成「Toyota Toyota 86」
  if (brand) {
    const names = [brand, ...(BRAND_EXTRA[brand] || [])];
    for (const n of names) s = s.replace(new RegExp(`(^|\\s)${n.replace(/[-]/g, '[- ]?')}(?=\\s|$)`, 'ig'), ' ');
  }
  const rest = s.replace(/\s+/g, ' ').trim();

  // 車型：第一個含英文字母的詞（Altis、ALTIS、AE86、320i、CR-V），排除排氣量（2.0L）；
  // 沒有的話用 2～3 位數字（86、911）
  const tokens = rest.replace(/([\u3400-\u9fff]+)/g, ' $1 ').split(/\s+/).filter(Boolean);
  const alpha = tokens.find((t) => /[A-Za-z]/.test(t) && /^[A-Za-z0-9\-+]+$/.test(t) && !/^\d+(\.\d+)?L$/i.test(t));
  const digits = tokens.find((t) => /^\d{2,3}$/.test(t));
  // Mazda 3、Mazda 6：品牌拿掉後只剩一位數字，車型寫成 Mazda3
  const mazda = brand === 'Mazda' && tokens.find((t) => /^\d$/.test(t));
  let model = alpha || digits || (mazda ? `Mazda${mazda}` : null) || BRAND_DEFAULT_MODEL[brandFolder.trim()] || null;
  if (model && /^[A-Z]{4,}$/.test(model)) {
    model = model.charAt(0) + model.slice(1).toLowerCase(); // ALTIS → Altis（CR-V、GTI 這類保持原樣）
  }

  const restEn = rest.replace(/[^\x00-\x7f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const head = [year, brand].filter(Boolean).join(' ');
  const title = `${head} ${rest || model || ''}`.replace(/\s+/g, ' ').trim();
  let titleEn = `${head} ${restEn || model || ''}`.replace(/\s+/g, ' ').trim();
  if (!hasCJK(title)) titleEn = '';

  if (!brand) notes.push(`品牌資料夾「${brandFolder}」系統不認得`);
  if (!year) notes.push('資料夾名稱沒有年份');

  return { brand, model, year, color, mileage, price, title, titleEn, notes };
}

// 把資料夾選取得到的檔案，依「品牌／車輛資料夾」分組
export function groupFiles(files) {
  const groups = new Map();
  for (const f of files) {
    const parts = (f.webkitRelativePath || f.name).split('/').filter(Boolean);
    if (parts.length < 3 || !isPhoto(parts[parts.length - 1]) || parts.some((p) => p.startsWith('.') || p === '__MACOSX')) continue;
    // 允許選到「VANTA 車源」或某個品牌資料夾：取照片往上兩層
    const carFolder = parts[parts.length - 2];
    const brandFolder = parts[parts.length - 3];
    const key = `${brandFolder}/${carFolder}`;
    if (!groups.has(key)) groups.set(key, { key, brandFolder, carFolder, files: [] });
    groups.get(key).files.push(f);
  }
  return [...groups.values()].map((g) => {
    const sorted = sortPhotos(g.files.map((f) => f.name));
    const files = sorted.map((n) => g.files.find((f) => f.name === n));
    return { ...g, files, ...parseCar(g.brandFolder, g.carFolder, sorted) };
  });
}
