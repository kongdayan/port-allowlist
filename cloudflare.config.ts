import { bindings, defineConfig, triggers, exports as workerExports } from 'cf/config';
import { readFileSync, existsSync } from 'node:fs';
const configFile = new URL('./.local/project.json', import.meta.url);
const local = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
const name = local.worker_name || 'port-allowlist';
const port = local.port || 10800;
const domains: string[] = local.domains || [];
export default defineConfig({
  worker: {
    name, entrypoint: './src/index.ts', compatibilityDate: '2026-11-03', workersDev: false,
    domains,
    exports: { AccessDatabase: workerExports.durableObject({ storage: 'sqlite' }) },
    env: {
      DB: bindings.durableObject({ worker: name, exportName: 'AccessDatabase' }),
      ASSETS: bindings.assets(), ADMIN_KEY_HASH: bindings.secret(), AGENT_KEY_HASH: bindings.secret(),
      MANAGED_PORT: bindings.text(String(port)),
      OPERATOR_HOSTS: bindings.text(local.operator_hosts || 'localhost,operator.localhost'),
      BRAND: bindings.text(local.brand || 'Port Access'),
    },
    observability: { enabled: true, redactQueryString: true,
      logs: { enabled: true, invocationLogs: false }, traces: { enabled: true, headSamplingRate: 0.05 } },
    triggers: [triggers.scheduled({ schedule: '17 * * * *' })],
    assets: { runWorkerFirst: ['/api/*', '/downloads/*'] },
  },
});
