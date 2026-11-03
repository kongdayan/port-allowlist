import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
export default defineConfig({ plugins: [cloudflare({ inspectorPort: false, persistState: process.env.PORT_ALLOWLIST_TEST_STATE ? { path: process.env.PORT_ALLOWLIST_TEST_STATE } : true })], server: { host: 'localhost', port: 8798 } });
