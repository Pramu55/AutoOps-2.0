import type { Metadata } from 'next';
import { DeploymentsClient } from './deployments-client';

export const metadata: Metadata = { title: 'Deployments' };

export default function DeploymentsPage() {
  return <DeploymentsClient />;
}
