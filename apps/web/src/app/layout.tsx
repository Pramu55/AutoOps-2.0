import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: { default: 'AutoOps', template: '%s | AutoOps' },
  description: 'AI-native DevOps control plane',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0d0f14',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
