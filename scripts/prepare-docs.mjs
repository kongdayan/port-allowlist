import { cp, mkdir } from 'node:fs/promises';
await mkdir('docs-site/public', { recursive: true });
await cp('docs/screenshots', 'docs-site/public/screenshots', { recursive: true });
await cp('public/favicon.svg', 'docs-site/public/favicon.svg');
