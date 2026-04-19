export default defineAppConfig({
  ui: {
    colors: {
      primary: 'convex-red',
      neutral: 'neutral',
    },
    footer: {
      slots: {
        root: 'border-t border-default',
        left: 'text-sm text-muted',
      },
    },
    commandPalette: {
      slots: {
        itemLeadingIcon: 'size-4',
      },
    },
    contentNavigation: {
      slots: {
        linkLeadingIcon: 'size-4',
        listWithChildren: 'ms-4.5',
      },
    },
    prose: {
      codeIcon: {
        deno: 'vscode-icons:file-type-deno',
        auto: 'vscode-icons:file-type-js',
        jsonc: 'i-vscode-icons-file-type-json',
      },
      tabs: {
        slots: {
          root: 'rounded border border-default gap-0',
        },
      },
      tabsItem: {
        base: 'p-4 sm:p-6',
      },
    },
  },
  seo: {
    siteName: 'Trellis',
  },
  header: {
    title: 'Trellis',
    to: '/',
    logo: {
      alt: 'Trellis',
      light: '',
      dark: '',
    },
    search: true,
    colorMode: true,
    links: [
      {
        icon: 'i-lucide-play',
        label: 'Demo',
        to: 'https://trellis-demo.vercel.app/',
        target: '_blank',
        'aria-label': 'Live Demo',
      },
      {
        icon: 'i-simple-icons-github',
        to: 'https://github.com/lupinum-dev/trellis',
        target: '_blank',
        'aria-label': 'GitHub',
      },
    ],
  },
  footer: {
    credits: `© ${new Date().getFullYear()} lupinum.com • MIT License`,
    colorMode: false,
    links: [
      {
        icon: 'i-simple-icons-github',
        to: 'https://github.com/lupinum-dev/trellis',
        target: '_blank',
        'aria-label': 'Trellis on GitHub',
      },
      {
        icon: 'i-simple-icons-npm',
        to: 'https://www.npmjs.com/package/@lupinum/trellis',
        target: '_blank',
        'aria-label': 'Trellis on npm',
      },
    ],
  },
  toc: {
    title: 'Table of Contents',
    bottom: {
      title: 'Resources',
      edit: 'https://github.com/lupinum-dev/trellis/edit/main/apps/docs/content',
      links: [
        {
          icon: 'i-lucide-star',
          label: 'Star on GitHub',
          to: 'https://github.com/lupinum-dev/trellis',
          target: '_blank',
        },
        {
          icon: 'i-lucide-book-open',
          label: 'Convex Better Auth',
          to: 'https://labs.convex.dev/better-auth',
          target: '_blank',
        },
        {
          icon: 'i-lucide-database',
          label: 'Convex Docs',
          to: 'https://docs.convex.dev',
          target: '_blank',
        },
        {
          icon: 'i-lucide-shield',
          label: 'Better Auth Docs',
          to: 'https://www.better-auth.com',
          target: '_blank',
        },
      ],
    },
  },
})
