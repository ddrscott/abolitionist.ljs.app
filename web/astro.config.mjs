// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

// Static export deployed as Worker assets. No Cloudflare adapter needed —
// the existing `worker/index.ts` handles `/api/chat`; everything else
// falls through to the static `dist/` output served by Workers Assets.
export default defineConfig({
  site: 'https://abolitionist.ljs.app',
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    react(),
    starlight({
      title: 'Ask the Abolitionist',
      description:
        'Straight answers on abortion from the abolitionist movement. For street dialog and new readers.',
      // Our homepage is a custom src/pages/index.astro (not a Starlight page).
      // Starlight only owns routes it sees as part of its content collection.
      disable404Route: true,
      // Replace Starlight's default sidebar with one built from article
      // frontmatter categories. See src/components/CustomSidebar.astro.
      components: {
        Sidebar: './src/components/CustomSidebar.astro',
      },
      customCss: ['./src/styles/custom.css'],
      // Show-by-default the search UI (pagefind).
      pagefind: true,
      favicon: '/favicon.svg',
    }),
  ],
});
