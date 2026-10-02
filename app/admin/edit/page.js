'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminShell from '../../../components/admin/AdminShell';
import CarEditor from '../../../components/CarEditor';

export default function EditPage() {
  return (
    <AdminShell>
      <Suspense fallback={<p className="admin-muted">載入中…</p>}>
        <AdminEditor />
      </Suspense>
    </AdminShell>
  );
}

function AdminEditor() {
  const id = useSearchParams().get('id');
  return <CarEditor key={id || 'new'} id={id} mode="admin" backHref="/admin" />;
}
