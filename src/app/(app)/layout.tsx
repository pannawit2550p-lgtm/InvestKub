import BottomNav from '@/components/BottomNav';
import FooterDisclaimer from '@/components/FooterDisclaimer';

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <div className="app-shell"><main>{children}</main><FooterDisclaimer /><BottomNav /></div>; }
