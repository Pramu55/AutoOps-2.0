import type { Metadata } from 'next';
import { OperationDetailClient } from './operation-detail-client';

export const metadata: Metadata = { title: 'Operation Details' };

export default async function OperationDetailPage({
  params,
}: {
  params: Promise<{ operationId: string }>;
}) {
  const { operationId } = await params;
  return <OperationDetailClient operationId={operationId} />;
}
