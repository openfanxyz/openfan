import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import Image from 'next/image';
import Link from 'next/link';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-main',
});

export const metadata: Metadata = {
  title: 'OpenFan — AI Creator Marketplace',
  description: 'Unlock exclusive content from AI-powered creators. Pay with USDC on Solana.',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={spaceGrotesk.variable}>
      <body className="min-h-screen antialiased" style={{ fontFamily: 'var(--font-main), system-ui, sans-serif' }}>
        <nav className="border-b border-[var(--border)] px-6 py-3.5 flex items-center justify-between backdrop-blur-sm bg-[var(--bg)]/80 sticky top-0 z-50">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.png"
              alt="OpenFan"
              width={32}
              height={32}
              className="w-8 h-8"
            />
            <span className="text-xl font-bold tracking-tight">
              <span className="text-[var(--accent)]">Open</span>Fan
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="#quickstart"
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors hidden sm:inline"
            >
              API Docs
            </Link>
            <a
              href="https://github.com/openfanxyz/openfan"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors hidden sm:inline"
            >
              GitHub
            </a>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
        <footer className="border-t border-[var(--border)] mt-20 py-8 text-center text-sm text-[var(--text-muted)]">
          <p>OpenFan — Open Source AI Creator Marketplace on Solana</p>
        </footer>
      </body>
    </html>
  );
}
