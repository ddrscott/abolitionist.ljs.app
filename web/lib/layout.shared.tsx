import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: 'Ask the Abolitionist',
  },
  links: [
    {
      text: 'Articles',
      url: '/pages',
      active: 'nested-url',
    },
  ],
};
