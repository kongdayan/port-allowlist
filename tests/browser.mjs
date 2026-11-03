import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
const fixtureIP = (...octets) => octets.join('.');
const directory = await mkdtemp(join(tmpdir(), 'port-allowlist-browser-'));
const origin = 'http://localhost:8799',
  clientOrigin = 'http://client.localhost:8799';
const { admin, agent } = JSON.parse(await readFile('.local/credentials.json', 'utf8'));
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--port', '8799', '--strictPort'],
  {
    env: { ...process.env, PORT_ALLOWLIST_TEST_STATE: directory },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '';
for (const stream of [server.stdout, server.stderr])
  stream.on('data', (chunk) => (output = (output + chunk).slice(-12000)));
let browser;
const request = async (path, { key = admin, method = 'GET', data } = {}) => {
  const response = await fetch(origin + path, {
    method,
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  assert.ok(response.ok, 'API ' + response.status + ' ' + path);
  return response.json();
};
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw Error('Local server stopped');
    try {
      if ((await fetch(origin + '/api/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(ready);
  const customer = await request('/api/admin/customers', {
    method: 'POST',
    data: { name: 'Example Team' },
  });
  await request('/api/admin/customers/' + customer.id, {
    method: 'PATCH',
    data: { max_ips: 100, max_devices: 10 },
  });
  await request('/api/admin/customers/' + customer.id + '/portal', {
    method: 'POST',
    data: { hostname: 'client.localhost', manage_existing_rules: true },
  });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    locale: 'en-US',
    extraHTTPHeaders: { 'CF-Connecting-IP': fixtureIP(11, 0, 0, 210) },
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.name));
  await page.goto(clientOrigin + '/?lang=en');
  await page.locator('#login button').click();
  assert.match(await page.locator('#key').evaluate((el) => el.validationMessage), /Enter a value/);
  await page.locator('#key').fill('not-a-valid-customer-token');
  await page.locator('#login button').click();
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /invalid|revoked/i);
  await page.locator('#locale').selectOption('zh-CN');
  assert.match(await page.getByRole('alert').innerText(), /密钥无效/);
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  await page.locator('#key').fill('');
  await page.locator('#login button').click();
  assert.match(await page.locator('#key').evaluate((el) => el.validationMessage), /请填写/);
  await page.locator('#key').fill(customer.key);
  await page.locator('#login button').click();
  await page.locator('#add-ip').waitFor();
  assert.match(await page.locator('#active-quota').innerText(), /0 \/ 100/);
  assert.equal(await page.locator('#settings').count(), 0);
  await page.locator('#authorize-network').click();
  await page.waitForFunction(() => document.querySelector('#grant-ip')?.value.length > 0);
  assert.equal(await page.locator('#grant-ip').inputValue(), fixtureIP(11, 0, 0, 210));
  await page.locator('#grant-label').fill('Browser authorization');
  await page.locator('#add-ip button[type=submit]').click();
  await page.locator('.renew-ip').first().waitFor();
  await page.locator('.renew-ip').first().click();
  await page.locator('#renew-ip-form [name=days]').fill('45');
  await page.locator('#renew-ip-form [type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('#expiry-dialog'));
  // Poll a real local API report, not mocked browser responses.
  await request('/api/agent/report', {
    key: agent,
    method: 'POST',
    data: {
      managed: [fixtureIP(11, 0, 0, 210) + '/32'],
      legacy: [],
      active: { [fixtureIP(11, 0, 0, 210)]: 2 },
      traffic_available: false,
      mode: 'apply',
      last_apply: Math.floor(Date.now() / 1000),
      events: [
        {
          id: 'synthetic-session',
          ip: fixtureIP(11, 0, 0, 210),
          at: Math.floor(Date.now() / 1000) - 30,
          bytes_up: 100,
          bytes_down: 200,
          duration: 2,
          status: '200',
        },
      ],
    },
  });
  await page.locator('#refresh').click();
  await page.locator('.activity-source').first().waitFor();
  await page.locator('.activity-source summary').first().click();
  await page.locator('[data-range="60"]').click();
  await page.locator('[aria-controls=grant-form-panel]').click();
  await page.locator('#grant-ip').fill(fixtureIP(11, 0, 0, 211));
  await page.locator('#grant-label').fill('Draft <b>plain text</b>');
  const dateBefore = await page.locator('#grant-date').inputValue();
  await page.locator('#locale').selectOption('en');
  assert.equal(await page.locator('#grant-label').inputValue(), 'Draft <b>plain text</b>');
  assert.equal(await page.locator('#grant-date').inputValue(), dateBefore);
  await page.evaluate(() => scrollTo({ top: 400, behavior: 'instant' }));
  const scroll = await page.evaluate(() => scrollY);
  const nextPoll = page.waitForResponse(
    (r) => r.url().includes('/api/dashboard') && r.request().method() === 'GET',
    { timeout: 16000 },
  );
  await nextPoll;
  assert.equal(await page.locator('#grant-label').inputValue(), 'Draft <b>plain text</b>');
  assert.equal(await page.locator('#grant-ip').inputValue(), fixtureIP(11, 0, 0, 211));
  assert.equal(await page.locator('.activity-source').first().getAttribute('open'), '');
  assert.equal(await page.locator('[data-range="60"]').getAttribute('aria-pressed'), 'true');
  const afterScroll = await page.evaluate(() => scrollY);
  assert.ok(
    Math.abs(afterScroll - scroll) < 3,
    `Polling changed scroll from ${scroll} to ${afterScroll}`,
  );
  await page.locator('.revoke-ip').first().click();
  await page.locator('#confirm-delete').click();
  await page.waitForFunction(() => !document.querySelector('#delete-dialog'));
  assert.ok(await page.locator('.status-deleting').count());
  const reference = 'a'.repeat(64),
    source = fixtureIP(11, 0, 0, 212) + '/32';
  await request('/api/agent/report', {
    key: agent,
    method: 'POST',
    data: {
      managed: [],
      legacy: [source],
      existing_rules: [{ ref: reference, cidr: source }],
      active: {},
      mode: 'apply',
      last_apply: Math.floor(Date.now() / 1000) + 1,
      events: [],
    },
  });
  await page.locator('#refresh').click();
  await page.locator('.delete-firewall').waitFor();
  await page.locator('.delete-firewall').click();
  await page.locator('#confirm-delete').click();
  await page.waitForFunction(() => !document.querySelector('.delete-firewall'));
  assert.deepEqual((await request('/api/agent/desired', { key: agent })).delete_legacy, [
    reference,
  ]);
  await request('/api/agent/report', {
    key: agent,
    method: 'POST',
    data: {
      managed: [],
      legacy: [],
      existing_rules: [],
      active: {},
      mode: 'apply',
      last_apply: Math.floor(Date.now() / 1000) + 2,
      events: [],
    },
  });
  await page.locator('#refresh').click();
  await page.waitForFunction(() => !document.querySelector('[data-firewall-ref]'));
  await page.locator('#device-name').fill('Browser device');
  await page.locator('#add-device button').click();
  await page.locator('#secret').waitFor();
  assert.ok((await page.locator('#secret-value').inputValue()).startsWith('pa_device_'));
  await page.locator('#close-secret').click();
  assert.equal(await page.locator('#secret-value').count(), 0);
  await page.locator('.revoke-device').click();
  await page.locator('#confirm-revoke-device').click();
  await page.waitForFunction(() => !document.querySelector('.revoke-device'));
  const enScript = await page.evaluate(() =>
    fetch('/downloads/macos?lang=en').then((r) => r.text()),
  );
  const zhScript = await page.evaluate(() =>
    fetch('/downloads/windows?lang=zh-CN').then((r) => r.text()),
  );
  assert.ok(!/\p{Script=Han}/u.test(enScript));
  assert.ok(zhScript.includes('粘贴设备密钥'));
  assert.ok(enScript.includes(clientOrigin));
  await page.locator('[data-diagram=architecture]').click();
  assert.ok(await page.locator('.architecture').count());
  const dashboard = await page.evaluate(() => fetch('/api/dashboard').then((r) => r.json()));
  for (const key of ['customers', 'customer_id', 'agent']) assert.equal(dashboard[key], undefined);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('#allowlist').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.locator('#locale').inputValue(), 'en');
  await page.locator('#locale').selectOption('zh-CN');
  await page.locator('.preferences .icon-button').click();
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const operator = await browser.newPage();
  await operator.goto(origin);
  await operator.locator('#key').fill(admin);
  await operator.locator('#login button').click();
  await operator.locator('.settings-panel summary').click();
  await operator.locator('#settings').waitFor();
  await operator.locator('#settings [name=max_ips]').fill('95');
  await operator.locator('#settings button').click();
  await operator.waitForFunction(() =>
    document.querySelector('#active-quota')?.textContent.includes('95'),
  );
  assert.ok(await operator.locator('#portal-host').count());
  await operator.close();
  assert.deepEqual(errors, []);
  console.log(
    'Live local browser passed: bilingual errors/login, detect + authorize current network, calendar renewal, actual polling preserves draft/scroll/details/range, manual and existing-rule deletion confirmation, devices, localized downloads, role isolation, operator settings, mobile and dark appearance.',
  );
} catch (e) {
  console.error(
    'Browser verification failed:',
    e.message
      .replace(/pa_[A-Za-z0-9_-]+/g, '[test-token]')
      .replace(/(?:\d{1,3}\.){3}\d{1,3}/g, '[test-address]'),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise((resolve) => {
    if (server.exitCode !== null) resolve();
    else server.once('exit', resolve);
  });
  await rm(directory, { recursive: true, force: true });
}
