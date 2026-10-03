'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import PartnerShell, { usePartner } from '../../../../components/partner/PartnerShell';
import CarEditor from '../../../../components/CarEditor';
import { getSupabase } from '../../../../lib/supabase';

export default function PartnerCarEditPage() {
  return (
    <PartnerShell>
      <Suspense fallback={<p className="admin-muted">載入中…</p>}>
        <PartnerEditor />
      </Suspense>
    </PartnerShell>
  );
}

function PartnerEditor() {
  const id = useSearchParams().get('id');
  const { profile } = usePartner();
  // 編輯既有車輛前，先確認這台車是自己提供的（資料庫也會擋，這裡是避免誤以為可以編輯）
  const [allowed, setAllowed] = useState(id ? null : true);

  useEffect(() => {
    if (!id) return setAllowed(true);
    setAllowed(null);
    getSupabase()
      .from('cars')
      .select('id')
      .eq('id', id)
      .eq('source_owner_id', profile.partner_id)
      .maybeSingle()
      .then(({ data }) => setAllowed(!!data));
  }, [id, profile.partner_id]);

  if (allowed === null) return <p className="admin-muted">載入中…</p>;
  if (!allowed) {
    return (
      <>
        <p className="admin-error">找不到這台車，或這台車不是你提供的，無法編輯。</p>
        <Link href="/partner/cars" className="back-link">回到我的車輛</Link>
      </>
    );
  }
  return <CarEditor key={id || 'new'} id={id} mode="partner" partnerId={profile.partner_id} backHref="/partner/cars" />;
}
