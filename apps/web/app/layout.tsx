import type { ReactNode } from 'react';

export const metadata = {
  title: 'NewsCore',
  description: 'Multi-tenant news platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
