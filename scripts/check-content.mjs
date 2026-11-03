import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname, extname, basename } from 'node:path';
import { build } from 'esbuild';
const bundle = await build({
  stdin: {
    contents: "export {messages} from './web/i18n';export {errorMessages} from './shared/errors';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'esm',
  write: false,
});
const { messages, errorMessages } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const parameters = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
for (const [key, [en, zh]] of Object.entries(messages)) {
  assert.ok(en && zh, key);
  assert.deepEqual(parameters(en), parameters(zh), key);
  assert.ok(!/\p{Script=Han}/u.test(en), 'Untranslated English label: ' + key);
}
for (const [code, value] of Object.entries(errorMessages)) {
  assert.ok(value.en && value['zh-CN'], code);
  assert.deepEqual(parameters(value.en), parameters(value['zh-CN']), code);
}
const folder = 'docs-site/src/content/docs';
const en = (await readdir(folder + '/en')).sort(),
  zh = (await readdir(folder + '/zh-cn')).sort();
assert.deepEqual(en, zh, 'Every documentation page needs both translations');
const files = ['README.md', 'README.zh-CN.md', 'CONTRIBUTING.md'];
for (const lang of ['en', 'zh-cn'])
  for (const file of en) files.push(folder + '/' + lang + '/' + file);
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const missing = [];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    const link = match[1];
    if (/^(?:https?:|mailto:|#)/.test(link)) continue;
    let path;
    if (link.startsWith('/port-allowlist/')) {
      const local = link.slice('/port-allowlist/'.length).split(/[?#]/)[0];
      if (local.startsWith('demo')) continue;
      if (local.startsWith('screenshots/')) path = resolve('docs', local);
      else {
        const candidate = resolve(folder, local);
        path = local.endsWith('/') ? candidate + '.md' : candidate;
        try {
          await stat(path);
        } catch {
          path = candidate + '.mdx';
        }
      }
    } else
      path = resolve(
        dirname(file),
        ...(file.includes('/content/docs/') ? [basename(file, extname(file))] : []),
        link.split(/[?#]/)[0],
      );
    try {
      await stat(path);
    } catch {
      if (!extname(path)) {
        try {
          await stat(path.replace(/\/$/, '') + '.md');
          continue;
        } catch {}
      }
      missing.push(file + ': ' + link);
    }
  }
  for (const command of text.matchAll(/\bnpm run ([a-z][\w:-]*)/g))
    assert.ok(
      rootPackage.scripts[command[1]],
      file + ': undocumented or missing script ' + command[1],
    );
  if (file.includes('/content/docs/'))
    assert.ok(/^---\n[\s\S]*?\btitle:[\s\S]*?\n---\n/.test(text), 'Missing page metadata: ' + file);
}
assert.deepEqual(missing, [], 'Broken source links');
console.log(
  'Content passed: ' +
    Object.keys(messages).length +
    ' paired UI labels, ' +
    Object.keys(errorMessages).length +
    ' stable errors, ' +
    en.length +
    ' pages per language, local links and npm commands.',
);
