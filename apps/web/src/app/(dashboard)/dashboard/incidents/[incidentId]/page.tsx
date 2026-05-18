import { IncidentDetailClient } from './incident-detail-client';

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ incidentId: string }>;
}) {
  const { incidentId } = await params;
  return <IncidentDetailClient incidentId={incidentId} />;
}
