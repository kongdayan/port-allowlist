import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
const repository = process.env.GITHUB_REPOSITORY || 'kongdayan/port-allowlist';
const [owner, name] = repository.split('/');
export default defineConfig({
  site: process.env.DOCS_SITE_URL || `https://${owner}.github.io`,
  base: process.env.DOCS_BASE_PATH || `/${name}`,
  integrations: [
    starlight({
      title: 'Port Allowlist',
      description: 'Self-service access to one protected TCP port.',
      defaultLocale: 'en',
      locales: {
        en: { label: 'English', lang: 'en' },
        'zh-cn': { label: '简体中文', lang: 'zh-CN' },
      },
      social: [{ icon: 'github', label: 'GitHub', href: `https://github.com/${repository}` }],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Get started',
          translations: { 'zh-cn': '开始使用' },
          items: [{ slug: 'quick-start' }, { slug: 'customer-guide' }, { slug: 'devices' }],
        },
        {
          label: 'Deploy & operate',
          translations: { 'zh-cn': '部署与运维' },
          items: [
            { slug: 'deployment' },
            { slug: 'security' },
            { slug: 'upgrade' },
            { slug: 'api' },
          ],
        },
      ],
    }),
  ],
});
