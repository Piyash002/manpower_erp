import type { Metadata, Viewport } from 'next';
import './globals.css';
import { GoogleTranslateScript } from '@/components/common/GoogleTranslateScript';

export const metadata: Metadata = {
  title: 'CodeZenX ERP — Manpower Training & Recruitment',
  description: 'CodeZenX ERP for technical training institutes and overseas recruitment agencies',
  icons: {
    icon: '/images/codezenx-logo.jpg',
    apple: '/images/codezenx-logo.jpg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0f19' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans">
        <GoogleTranslateScript />
        {children}
      </body>
    </html>
  );
}
