import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
await rm('site-dist', { recursive: true, force: true });
await mkdir('site-dist', { recursive: true });
await cp('docs-site/dist', 'site-dist', { recursive: true });
await cp('demo-dist', 'site-dist/demo', { recursive: true });
await writeFile('site-dist/.nojekyll', '');
console.log('Static documentation and isolated demo assembled in site-dist/.');
