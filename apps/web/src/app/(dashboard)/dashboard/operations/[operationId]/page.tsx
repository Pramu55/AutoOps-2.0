import { OperationDetailClient } from './operation-detail-client';

export default async function OperationDetailPage({
  params,
}: {
  params: Promise<{ operationId: string }>;
}) {
  const { operationId } = await params;
  return <OperationDetailClient operationId={operationId} />;
}
