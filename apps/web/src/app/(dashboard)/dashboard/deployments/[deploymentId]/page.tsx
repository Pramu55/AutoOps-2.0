import type { Metadata } from 'next';
import { DeploymentDetailClient } from './deployment-detail-client';

export const metadata: Metadata = { title: 'Deployment Details' };

export default async function DeploymentDetailPage({
  params,
}: {
  params: Promise<{ deploymentId: string }>;
}) {
  const { deploymentId } = await params;
  return <DeploymentDetailClient deploymentId={deploymentId} />;
}
