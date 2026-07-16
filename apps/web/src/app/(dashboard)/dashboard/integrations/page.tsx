import type { Metadata } from 'next';
import { IntegrationsHubClient } from './integrations-hub-client';

export const metadata: Metadata = { title: 'Integrations Hub' };

export default function IntegrationsPage() {
  return <IntegrationsHubClient />;
}
