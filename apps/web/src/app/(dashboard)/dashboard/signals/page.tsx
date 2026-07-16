import type { Metadata } from 'next';
import { SignalsClient } from './signals-client';

export const metadata: Metadata = { title: 'Signals' };

export default function SignalsPage() {
  return <SignalsClient />;
}
