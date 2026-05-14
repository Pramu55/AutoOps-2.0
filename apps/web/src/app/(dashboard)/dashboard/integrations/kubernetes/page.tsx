import type { Metadata } from 'next';
import { KubernetesClient } from './kubernetes-client';

export const metadata: Metadata = { title: 'Kubernetes' };

export default function KubernetesPage() {
  return <KubernetesClient />;
}
