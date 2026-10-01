import { getSupabase } from './supabase';

// kind: 'view' | 'phone' | 'line'
export async function trackCar(carId, kind) {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session) return; // 後台登入的人不計

    const key = `vanta:${kind}:${carId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');

    await supabase.rpc('track_car', { p_car_id: carId, p_kind: kind });
  } catch (e) {
    // 統計失敗不影響客人使用
  }
}
