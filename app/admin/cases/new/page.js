'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import { getSupabase } from '../../../../lib/supabase';
import { CASE_TYPES, SOURCES, carRef } from '../../../../lib/case';

export default function NewCasePage() {
  return (
    <AdminShell>
      <Suspense fallback={<p className="admin-muted">載入中…</p>}>
        <NewCase />
      </Suspense>
    </AdminShell>
  );
}

function NewCase() {
  const router = useRouter();
  const params = useSearchParams();
  const inquiryId = params.get('inquiry');

  const [cars, setCars] = useState([]);
  const [partners, setPartners] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [type, setType] = useState('buy');
  const [source, setSource] = useState(inquiryId ? 'website' : 'line');
  const [carId, setCarId] = useState(params.get('car') || '');
  const [partnerId, setPartnerId] = useState('');
  const [customerMode, setCustomerMode] = useState('new');
  const [customerId, setCustomerId] = useState('');
  const [customerQ, setCustomerQ] = useState('');
  const [carQ, setCarQ] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', line_name: '' });
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const sb = getSupabase();
      const [c, p, cu] = await Promise.all([
        sb.from('cars').select('id, title, status, source_owner_id').order('created_at', { ascending: false }).limit(2000),
        sb.from('partners').select('id, name, active').order('name'),
        sb.from('customers').select('id, name, phone, line_name').order('updated_at', { ascending: false }).limit(1000),
      ]);
      setCars(c.data || []);
      setPartners((p.data || []).filter((x) => x.active));
      setCustomers(cu.data || []);
    })();
  }, []);

  useEffect(() => {
    const car = cars.find((c) => c.id === carId);
    if (car && car.source_owner_id) setPartnerId(car.source_owner_id);
  }, [carId, cars]);

  const carMatches = useMemo(() => {
    const k = carQ.trim().toLowerCase();
    if (!k) return [];
    return cars.filter((c) => c.title.toLowerCase().includes(k) || carRef(c.id).toLowerCase().includes(k)).slice(0, 20);
  }, [cars, carQ]);

  const customerMatches = useMemo(() => {
    const k = customerQ.trim().toLowerCase();
    if (!k) return customers.slice(0, 10);
    return customers
      .filter((c) => [c.name, c.phone, c.line_name].filter(Boolean).join(' ').toLowerCase().includes(k))
      .slice(0, 20);
  }, [customers, customerQ]);

  const selectedCar = cars.find((c) => c.id === carId);

  async function save() {
    const sb = getSupabase();
    if (customerMode === 'existing' && !customerId) return alert('請選擇客戶');
    if (customerMode === 'new' && !newCustomer.name.trim() && !newCustomer.line_name.trim() && !newCustomer.phone.trim()) {
      return alert('請至少填寫客戶的稱呼、電話或 LINE 名稱其中一項');
    }
    setBusy(true);
    try {
      let cid = customerId;
      if (customerMode === 'new') {
        const { data, error } = await sb
          .from('customers')
          .insert({
            name: newCustomer.name.trim() || null,
            phone: newCustomer.phone.trim() || null,
            line_name: newCustomer.line_name.trim() || null,
            source,
          })
          .select('id')
          .single();
        if (error) throw error;
        cid = data.id;
      }
      const { data: created, error } = await sb
        .from('cases')
        .insert({
          type,
          source,
          status: 'in_progress',
          customer_id: cid,
          car_id: carId || null,
          partner_id: partnerId || null,
          subject: selectedCar ? selectedCar.title : null,
          customer_request: request.trim() || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      if (inquiryId) {
        await sb.from('web_inquiries').update({ handled: true, case_id: created.id }).eq('id', inquiryId);
      }
      router.push(`/admin/cases/${created.id}`);
    } catch (e) {
      alert('建立失敗：' + (e.message || e));
      setBusy(false);
    }
  }

  return (
    <>
      <h1>新增案件</h1>

      <div className="case-section">
        <h3>案件類型</h3>
        <div className="segmented">
          {CASE_TYPES.map(([k, l]) => <button key={k} aria-pressed={type === k} onClick={() => setType(k)}>{l}</button>)}
        </div>
        <h3 style={{ marginTop: 16 }}>客戶來源</h3>
        <div className="segmented">
          {SOURCES.map(([k, l]) => <button key={k} aria-pressed={source === k} onClick={() => setSource(k)}>{l}</button>)}
        </div>
      </div>

      <div className="case-section">
        <h3>客戶</h3>
        <div className="segmented">
          <button aria-pressed={customerMode === 'new'} onClick={() => setCustomerMode('new')}>新客戶</button>
          <button aria-pressed={customerMode === 'existing'} onClick={() => setCustomerMode('existing')}>既有客戶</button>
        </div>
        {customerMode === 'new' ? (
          <>
            <input placeholder="稱呼，例如 王先生" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
            <input placeholder="電話（選填）" inputMode="tel" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
            <input placeholder="LINE 顯示名稱（選填）" value={newCustomer.line_name} onChange={(e) => setNewCustomer({ ...newCustomer, line_name: e.target.value })} />
          </>
        ) : (
          <>
            <input placeholder="搜尋姓名、電話、LINE 名稱" value={customerQ} onChange={(e) => setCustomerQ(e.target.value)} />
            <div className="pick-list">
              {customerMatches.map((c) => (
                <button key={c.id} aria-pressed={customerId === c.id} onClick={() => setCustomerId(c.id)}>
                  {c.name || c.line_name || '未命名'}{c.phone ? `｜${c.phone}` : ''}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="case-section">
        <h3>車輛（選填）</h3>
        {selectedCar && <p className="value">{selectedCar.title}（編號 {carRef(selectedCar.id)}）</p>}
        <input placeholder="搜尋車名或車輛編號" value={carQ} onChange={(e) => setCarQ(e.target.value)} />
        {carMatches.length > 0 && (
          <div className="pick-list">
            {carMatches.map((c) => (
              <button key={c.id} aria-pressed={carId === c.id} onClick={() => { setCarId(c.id); setCarQ(''); }}>
                {c.title}｜{carRef(c.id)}
              </button>
            ))}
          </div>
        )}
        {carId && <button className="text-link" style={{ marginTop: 8 }} onClick={() => setCarId('')}>取消選擇車輛</button>}

        <h3 style={{ marginTop: 16 }}>車源負責人</h3>
        <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
          <option value="">暫不指定</option>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="case-section">
        <h3>客戶需求</h3>
        <textarea placeholder="例如：想了解里程、車況及價格，預計週六下午看車" value={request} onChange={(e) => setRequest(e.target.value)} />
      </div>

      <div className="form-actions">
        <button className="btn btn-light" onClick={() => router.push('/admin/cases')} disabled={busy}>取消</button>
        <button className="btn btn-dark" onClick={save} disabled={busy}>{busy ? '建立中…' : '建立案件'}</button>
      </div>
    </>
  );
    }
