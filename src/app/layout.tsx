import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Color Wars',
  description: 'Real-time multiplayer grid conquest game. Grow your circles, conquer the board.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
