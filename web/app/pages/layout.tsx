import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { baseOptions } from '@/lib/layout.shared';
import { buildCategoryTree } from '@/lib/category-tree';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout {...baseOptions} tree={buildCategoryTree()}>
      {children}
    </DocsLayout>
  );
}
