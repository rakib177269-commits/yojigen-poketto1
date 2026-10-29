import { Inter, Cormorant_Garamond } from 'next/font/google';
import { headers } from 'next/headers';
import { SITE } from '../lib/site.js';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const display = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-display-face', display: 'swap' });

export const metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — Gadgets, gifts & cute things`, template: `%s · ${SITE.name}` },
  description: SITE.tagline,
  applicationName: SITE.name,
  openGraph: { siteName: SITE.name, type: 'website', locale: 'en_BD' },
  twitter: { card: 'summary_large_image' },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: '#0e1f5b',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }) {
  // Reading the request makes every page render per request, which the
  // per-request CSP nonce requires (see proxy.js).
  await headers();
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
