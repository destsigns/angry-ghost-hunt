import './globals.css';
export const metadata = { title: '怒鬼尋蹤', description: '怒鬼尋蹤 Halloween IRL GeoGuessr' };
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="zh-Hant"><body>{children}</body></html>);
}
