import { ArgoCdClient } from './argocd-client';

export const metadata = {
  title: 'Argo CD',
};

export default function ArgoCdPage() {
  return <ArgoCdClient />;
}
