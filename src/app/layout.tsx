import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Manpower Training & Recruitment ERP',
  description: 'Enterprise ERP for technical training institutes and overseas recruitment agencies',
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
