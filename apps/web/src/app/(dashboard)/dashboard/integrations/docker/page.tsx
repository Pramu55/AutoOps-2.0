import type { Metadata } from 'next';
import { DockerClient } from './docker-client';

export const metadata: Metadata = { title: 'Docker Integration' };

export default function DockerPage() {
  return <DockerClient />;
}
