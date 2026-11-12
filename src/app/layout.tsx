import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CodeZenX ERP — Manpower Training & Recruitment',
  description: 'CodeZenX ERP for technical training institutes and overseas recruitment agencies',
  icons: {
    icon: '/images/codezenx-logo.jpg',
    apple: '/images/codezenx-logo.jpg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 font-sans">
        {children}
      </body>
    </html>
  );
}
