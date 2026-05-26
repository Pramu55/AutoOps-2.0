import type { Metadata } from 'next';
import { ResourcesClient } from './resources-client';

export const metadata: Metadata = { title: 'Resource Graph' };

export default function ResourcesPage() {
  return <ResourcesClient />;
}
