import type { Metadata } from 'next';
import { JenkinsClient } from './jenkins-client';

export const metadata: Metadata = { title: 'Jenkins Integration' };

export default function JenkinsPage() {
  return <JenkinsClient />;
}
