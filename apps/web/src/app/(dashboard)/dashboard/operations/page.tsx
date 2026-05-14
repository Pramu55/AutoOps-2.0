import type { Metadata } from 'next';
import { OperationsClient } from './operations-client';

export const metadata: Metadata = { title: 'Operations Hub' };

export default function OperationsPage() {
  return <OperationsClient />;
}
