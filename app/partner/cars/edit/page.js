'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PartnerShell, { usePartner } from '../../../../components/partner/PartnerShell';
import CarEditor from '../../../../components/CarEditor';

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
  return <CarEditor key={id || 'new'} id={id} mode="partner" partnerId={profile.partner_id} backHref="/partner/cars" />;
}
