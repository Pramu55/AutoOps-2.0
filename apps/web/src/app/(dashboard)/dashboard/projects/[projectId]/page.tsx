import type { Metadata } from 'next';
import { ProjectDetailClient } from './project-detail-client';

export const metadata: Metadata = { title: 'Project Details' };

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <ProjectDetailClient projectId={projectId} />;
}
