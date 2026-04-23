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
  vite: {
    ssr: {
      // Excalidraw does `import 'roughjs/bin/rough'` — a sub-path that
      // Node's native ESM resolver rejects because roughjs's exports
      // map doesn't expose it. Forcing Vite to bundle (noExternal)
      // routes the import through Vite's resolver, which handles the
      // sub-path fine. Needed even though the component is
      // `client:only` because Astro/Starlight still walks the import
      // chain during MDX prerender.
      noExternal: ['@excalidraw/excalidraw', 'roughjs'],
    },
  },
  integrations: [
    react(),
    starlight({
      title: 'Ask the Abolitionist',
      description:
        'Straight answers on abortion from the abolitionist movement. For street dialog and new readers.',
      // Self-hosted Plausible at plausible.ljs.app — needs `data-api` since
      // the default script ships to plausible.io. Injects into every
      // Starlight-rendered route; the custom home/draw pages wire it up
      // in their own <head>.
      head: [
        {
          tag: 'script',
          attrs: {
            defer: true,
            'data-domain': 'abolitionist.ljs.app',
            'data-api': 'https://plausible.ljs.app/api/event',
            src: 'https://plausible.ljs.app/js/script.js',
          },
        },
      ],
      // Our homepage is a custom src/pages/index.astro (not a Starlight page).
      // Starlight only owns routes it sees as part of its content collection.
      disable404Route: true,
      // Replace Starlight's default sidebar with one built from article
      // frontmatter categories. See src/components/CustomSidebar.astro.
      components: {
        Sidebar: './src/components/CustomSidebar.astro',
        // Shared top bar used on the homepage too — single source of
        // truth for branding + nav links, with the Starlight chrome
        // (site title, search field, socials) hidden via scoped CSS.
        Header: './src/components/SiteHeader.astro',
        // Light-only site — no need for a light/dark picker.
        ThemeSelect: './src/components/EmptyComponent.astro',
      },
      customCss: ['./src/styles/custom.css'],
      // Show-by-default the search UI (pagefind).
      pagefind: true,
      favicon: '/icon-full.png',
      logo: {
        src: './public/icon-full.png',
        replacesTitle: false,
        alt: 'Ask the Abolitionist',
      },
    }),
  ],
});
