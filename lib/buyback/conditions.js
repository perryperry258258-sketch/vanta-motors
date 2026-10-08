// 我要賣車：客人自填的車況資訊（選填），用在網站表單、LINE 訊息與後台
export const CONDITION_OPTIONS = {
  accident: {
    zh: { label: '事故紀錄', options: [['none', '無事故'], ['minor', '小擦撞'], ['body', '有鈑金烤漆'], ['major', '重大事故'], ['unknown', '不確定']] },
    en: { label: 'Accident history', options: [['none', 'None'], ['minor', 'Minor scrapes'], ['body', 'Body/paint repair'], ['major', 'Major accident'], ['unknown', 'Not sure']] },
  },
  flood: {
    zh: { label: '泡水紀錄', options: [['none', '無泡水'], ['yes', '有泡水'], ['unknown', '不確定']] },
    en: { label: 'Flood damage', options: [['none', 'None'], ['yes', 'Yes'], ['unknown', 'Not sure']] },
  },
  maintenance: {
    zh: { label: '保養紀錄', options: [['dealer', '原廠定保'], ['independent', '外廠保養'], ['partial', '紀錄不完整'], ['unknown', '不確定']] },
    en: { label: 'Service history', options: [['dealer', 'Dealer serviced'], ['independent', 'Independent shop'], ['partial', 'Incomplete'], ['unknown', 'Not sure']] },
  },
};

export const REGIONS = [
  '台北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣', '連江縣',
];

export const CONDITION_KEYS = ['accident', 'flood', 'maintenance'];

export function conditionLabel(key, value, lang = 'zh') {
  const def = CONDITION_OPTIONS[key] && CONDITION_OPTIONS[key][lang === 'en' ? 'en' : 'zh'];
  const hit = def && def.options.find(([v]) => v === value);
  return hit ? hit[1] : null;
}

// 只接受選項裡的值（伺服器端驗證用）
export function cleanCondition(c = {}) {
  const pick = (k) => (CONDITION_OPTIONS[k].zh.options.some(([v]) => v === c[k]) ? c[k] : null);
  return {
    accident: pick('accident'),
    flood: pick('flood'),
    maintenance: pick('maintenance'),
    region: REGIONS.includes(c.region) ? c.region : null,
    condition_note: String(c.note || '').trim().slice(0, 300) || null,
  };
}
