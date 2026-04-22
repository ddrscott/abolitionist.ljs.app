import './global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Abolition Knowledge Base',
  description:
    'Searchable archive of articles from abolitionistsrising.com and freethestates.org.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider
          search={{
            options: {
              // Download the pre-built Orama index from the static
              // `/api/search` endpoint and run queries in-browser.
              type: 'static',
            },
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
