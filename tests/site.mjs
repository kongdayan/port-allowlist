import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
const server = spawn(process.execPath, ['scripts/serve-site.mjs', '--port', '8811'], {
  stdio: ['ignore', 'pipe', 'pipe'],
});
let browser;
let output = '';
for (const stream of [server.stdout, server.stderr])
  stream.on('data', (data) => (output = (output + data).slice(-8000)));
const origin = 'http://localhost:8811',
  base = origin + '/port-allowlist';
const fixtureIP = (...parts) => parts.join('.');
async function files(path) {
  const list = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) list.push(...(await files(file)));
    else list.push(file);
  }
  return list;
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error('Static server stopped');
    try {
      if ((await fetch(base + '/en/')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready);
  const htmlFiles = (await files('site-dist')).filter(
    (f) => f.endsWith('.html') && !f.includes('/demo/') && !f.endsWith('404.html'),
  );
  let links = 0;
  const cache = new Map();
  for (const file of htmlFiles) {
    const source = await readFile(file, 'utf8'),
      url = base + '/' + file.slice('site-dist/'.length).replace(/index\.html$/, '');
    for (const match of source.matchAll(/(?:href|src)="([^"<>]+)"/g)) {
      const value = match[1].replaceAll('&amp;', '&');
      if (/^(?:mailto:|data:|javascript:)/.test(value)) continue;
      let target = new URL(value, url);
      if (target.hostname === 'kongdayan.github.io')
        target = new URL(target.pathname + target.search + target.hash, origin);
      if (target.origin !== origin) continue;
      const key = target.origin + target.pathname;
      if (!cache.has(key)) {
        const response = await fetch(key);
        assert.ok(
          response.ok,
          `Broken built link ${target.pathname} in ${file}: ${response.status}`,
        );
        cache.set(
          key,
          response.headers.get('Content-Type')?.includes('text/html')
            ? await response.text()
            : null,
        );
      }
      if (target.hash && cache.get(key)) {
        const hash = decodeURIComponent(target.hash.slice(1));
        assert.ok(
          cache.get(key).includes('id="' + hash + '"') ||
            cache.get(key).includes("id='" + hash + "'"),
          `Missing anchor ${target.pathname}${target.hash}`,
        );
      }
      links++;
    }
  }
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    locale: 'en-US',
  });
  const page = await context.newPage();
  const errors = [],
    apiRequests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (/^\/(?:api|port-allowlist\/demo\/api)\//.test(new URL(r.url()).pathname))
      apiRequests.push(r.url());
  });
  await page.goto(base + '/');
  await page.waitForURL('**/en/');
  assert.match(await page.getByRole('heading', { level: 1 }).innerText(), /authorized/i);
  await page.locator('starlight-lang-select select').selectOption('/port-allowlist/zh-cn/');
  await page.waitForURL('**/zh-cn/');
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  await page.goto(base + '/en/customer-guide/');
  await page.locator('site-search button[data-open-modal]').click();
  const search = page.locator('.pagefind-ui__search-input').first();
  await search.fill('expiry');
  await page.locator('.pagefind-ui__result-link').first().waitFor();
  await page.keyboard.press('Escape');
  await page.goto(base + '/demo/?lang=en');
  await page.locator('#allowlist').waitFor();
  assert.ok(await page.locator('.demo-bar').count());
  assert.ok(!(await page.locator('body').innerText()).includes(fixtureIP(11, 64, 10, 20)));
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  assert.deepEqual(
    scan.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    [],
    'Accessibility violations in customer demo',
  );
  await page.locator('.demo-controls select').nth(1).selectOption('dry_run');
  await page.locator('#service-state .status-dry_run').waitFor();
  await page.locator('#authorize-network').click();
  await page.locator('#grant-ip').waitFor();
  assert.equal(await page.locator('#grant-ip').inputValue(), fixtureIP(11, 69, 10, 70));
  await page.locator('#grant-label').fill('Demo test grant');
  await page.locator('#add-ip button[type=submit]').click();
  await page.locator('.grant-row').filter({ hasText: 'Demo test grant' }).waitFor();
  await page
    .locator('.grant-row')
    .filter({ hasText: 'Demo test grant' })
    .locator('.status-submitted')
    .waitFor();
  await page.waitForTimeout(3100);
  await page.locator('#refresh').click();
  await page
    .locator('.grant-row')
    .filter({ hasText: 'Demo test grant' })
    .locator('.status-syncing')
    .waitFor();
  await page.locator('.demo-controls select').nth(1).selectOption('ready');
  const row = page.locator('.grant-row').filter({ hasText: 'Demo test grant' });
  await row.locator('.status-applied').waitFor();
  await row.locator('.renew-ip').click();
  const originalDate = await page.locator('#renew-date').inputValue();
  await page.locator('#renew-days').fill('90');
  assert.notEqual(await page.locator('#renew-date').inputValue(), originalDate);
  await page.locator('#renew-ip-form button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('#expiry-dialog'));
  await row.locator('.revoke-ip').click();
  await page.locator('#confirm-delete').click();
  await page.waitForFunction(() => !document.querySelector('#delete-dialog'));
  await row.locator('.status-deleting').waitFor();
  const sync = page.locator('.demo-controls select').nth(1);
  for (const value of ['unavailable', 'stale']) {
    await sync.selectOption(value);
    await page.locator('#service-state .status-' + value).waitFor();
  }
  await sync.selectOption('error');
  await page.locator('#service-state .status-error').waitFor();
  assert.ok(await page.locator('.status-syncFailed').count());
  await page.locator('#locale').selectOption('zh-CN');
  assert.match(await page.locator('#service-state').innerText(), /同步失败/);
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  await page.locator('.preferences .icon-button').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  const darkScan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  assert.deepEqual(
    darkScan.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    [],
    'Accessibility violations in dark Chinese demo',
  );
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      'Horizontal overflow at ' + width,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator('.demo-controls select').first().selectOption('admin');
  await page.locator('.settings-panel').waitFor();
  await page.locator('.settings-panel summary').click();
  await page.locator('#settings').waitFor();
  await page.locator('#locale').selectOption('en');
  const operatorScan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  assert.deepEqual(
    operatorScan.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    [],
    'Accessibility violations in operator demo',
  );
  await page.locator('.demo-controls button').click();
  await page.locator('#allowlist').waitFor();
  assert.equal(await page.locator('.grant-row').filter({ hasText: 'Demo test grant' }).count(), 0);
  assert.equal(await page.locator('.settings-panel').count(), 0);
  await page.locator('#logout').click();
  await page.locator('#login').waitFor();
  assert.equal(await page.locator('#key').count(), 0);
  await page.locator('#login button').click();
  await page.locator('#allowlist').waitFor();
  assert.deepEqual(apiRequests, [], 'Static demo must not call real APIs');
  assert.deepEqual(errors, []);
  console.log(
    `Site passed: ${htmlFiles.length} HTML pages, ${links} local asset/link/anchor references, language routing and search, demo add/renew/delete + failure states, masked data, no API calls, customer/operator accessibility, dark Chinese, and mobile widths.`,
  );
} catch (e) {
  console.error('Site verification failed:', e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise((resolve) => {
    if (server.exitCode !== null) resolve();
    else server.once('exit', resolve);
  });
}
