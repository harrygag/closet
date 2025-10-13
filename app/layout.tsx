import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Virtual Closet Arcade - AI Reseller Platform',
  description: 'AI-powered clothing reseller platform with marketplace integration',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  themeColor: '#ec4899',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
