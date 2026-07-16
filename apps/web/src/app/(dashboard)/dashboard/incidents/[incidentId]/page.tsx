import type { Metadata } from 'next';
import { IncidentDetailClient } from './incident-detail-client';

export const metadata: Metadata = { title: 'Incident Details' };

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ incidentId: string }>;
}) {
  const { incidentId } = await params;
  return <IncidentDetailClient incidentId={incidentId} />;
}
