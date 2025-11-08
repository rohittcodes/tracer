import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tracer',
  description: 'Tracer - A smart mini-observability platform for monitoring and tracing your applications.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}