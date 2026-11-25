import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = { title: 'Pulseboard', description: 'Infrastructure monitoring' };

// Applies the saved theme before first paint so there is no flash.
const themeScript = `try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t;var a=localStorage.getItem('accent');if(a){var r=document.documentElement.style;r.setProperty('--accent',a);r.setProperty('--on-accent',localStorage.getItem('onAccent')||'#fff')}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
