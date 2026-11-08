import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'SyncWave — music, together',description:'Listen in sync. Share your sound.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
