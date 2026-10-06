import type { Metadata } from 'next';
import { Noto_Sans_Thai } from 'next/font/google';
import './globals.css';
import Providers from './providers';

const notoSansThai = Noto_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-noto-sans-thai',
});

export const metadata: Metadata = {
  title: 'InvestKub',
  description: 'ฝึกลงทุนด้วยเงินสมมติ เรียนรู้การลงทุนหุ้นสหรัฐฯ แบบจำลองได้ฟรี',
  openGraph: {
    title: 'InvestKub',
    description: 'ฝึกลงทุนด้วยเงินสมมติ เรียนรู้การลงทุนหุ้นสหรัฐฯ แบบจำลองได้ฟรี',
    siteName: 'InvestKub',
    type: 'website',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th" className={notoSansThai.variable}><body><Providers>{children}</Providers></body></html>;
}
