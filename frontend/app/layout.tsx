import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TalkBridge - Universal Translation Platform',
  description: 'Translate YouTube videos and have real-time multilingual conversations',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
