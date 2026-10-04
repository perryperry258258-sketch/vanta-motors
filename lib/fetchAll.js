// Supabase 每次查詢最多只回傳 1,000 筆（超過的會被默默截掉）。
// 需要讀超過 1,000 筆時用這個分頁讀完。build 每次都要回傳一個「新的」查詢，而且要有固定排序（例如 .order('id')）。
export async function fetchAll(build, { pageSize = 1000, max = 50000 } = {}) {
  const out = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}
