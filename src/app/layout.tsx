import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Colour Wars',
  description: 'Real-time multiplayer grid conquest. Grow your circles, conquer the board.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Orbitron:wght@400;700;900&family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased scanlines" style={{ background: '#06060F' }}>
        {children}
      </body>
    </html>
  );
}
