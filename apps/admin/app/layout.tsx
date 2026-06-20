import type { ReactNode } from 'react';

export const metadata = {
  title: 'NewsCore Admin',
  description: 'NewsCore admin / CMS',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
