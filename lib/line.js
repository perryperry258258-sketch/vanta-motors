import crypto from 'crypto';

// 只能在伺服器端使用
const API = 'https://api.line.me/v2/bot';

export function verifySignature(rawBody, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function call(path, payload) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`LINE ${res.status}: ${await res.text()}`);
}

// 回覆訊息（不計入每月則數）
export function reply(replyToken, messages) {
  return call('/message/reply', { replyToken, messages });
}

// 主動推播（會計入每月則數）
export function push(to, messages) {
  return call('/message/push', { to, messages });
}

export async function getProfile(userId) {
  try {
    const res = await fetch(`${API}/profile/${encodeURIComponent(userId)}`, {
      headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function text(t) {
  return { type: 'text', text: String(t).slice(0, 5000) };
}

export function confirmTemplate(caseNo, subject, token) {
  return {
    type: 'template',
    altText: `請確認您的購車案件 ${caseNo}`,
    template: {
      type: 'confirm',
      text: `案件編號 ${caseNo}\n${subject || ''}\n\n請問是否已完成購車？`.slice(0, 240),
      actions: [
        { type: 'postback', label: '是，已成交', data: `confirm=${token}&r=confirmed`, displayText: '是，已成交' },
        { type: 'postback', label: '尚未成交', data: `confirm=${token}&r=denied`, displayText: '尚未成交' },
      ],
    },
  };
}
