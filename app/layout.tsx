import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'OpenFan — AI Creator Marketplace',
  description: 'Unlock exclusive content from AI-powered creators. Pay with USDC on Solana.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <nav className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-2xl font-bold tracking-tight">
            <span className="text-[var(--accent)]">Open</span>Fan
          </a>
          <span className="text-sm text-[var(--text-muted)]">AI Creator Marketplace</span>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
