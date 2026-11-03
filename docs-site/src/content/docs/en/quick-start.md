---
title: Quick start
description: Try the demo or start a real local API without cloud credentials.
---

## Requirements

Node.js **22.23.4+**, npm, and Git. The documented CI runtime is Node.js 22.23.4. Agent tests and ECS require Python 3.10+. Dependencies are locked; use `npm ci`.

## Interactive demo

```sh
git clone https://github.com/kongdayan/port-allowlist.git
cd port-allowlist
npm ci
npm run demo
```

Open the URL printed by Vite. No setup, cloud account, login token, or ECS server is needed. This is clearly labeled sample data. It supports adding, changing expiry and deleting sample grants, viewing activity, and switching customer/operator roles and synchronizer states. Changes stay in this tab and disappear on reload. **Reset demo** restores the initial data.

The demo never sends API requests or connects to a cloud. Source addresses are masked in its UI and screenshots; they are generated fixtures, not production inventory. Token displays are illustrative and cannot access a service. Script downloads are replaced by documentation links.

## Real local portal and API

```sh
npm run setup
npm run dev
```

In a second terminal, in the same directory:

```sh
npm run bootstrap
```

| Entry    | Local URL                      | Token location                       |
| -------- | ------------------------------ | ------------------------------------ |
| Operator | `http://localhost:8798`        | `admin` in `.local/credentials.json` |
| Customer | `http://client.localhost:8798` | `key` in `.local/client.json`        |

Inspect the token file locally using your editor or password manager, then paste the value into the sign-in form. Keys are generated randomly, stored with owner-only permissions, and never printed by setup. Re-running setup preserves them. Never commit `.local` or `.dev.vars`.

Bootstrap creates one customer with 100 authorizations and 10 automatic devices. Re-running it updates the saved customer, without creating a new one. The local API stores data in SQLite Durable Objects. This flow does not install the ECS synchronizer or change a firewall: **Not connected** and **Synchronizing** are expected until an agent is configured.

If `client.localhost` does not resolve in your browser, use Chromium or add the hostname to your local hosts file. HTTP is only for local development; production requires HTTPS.

## Language, appearance and time

Use the language selector to switch between English and Simplified Chinese. The selection and light/dark appearance are saved locally; no token is stored in localStorage. Form input, expanded session groups and chart range survive status polling.

Expiry follows the independently configured business time zone, defaulting to UTC+8. Language or browser location never changes it. Selecting a date means access expires at **00:00 at the start of that date**, excluding that day's daytime.

## Verify a checkout

```sh
npm run setup
npm run build
npm run check
npm test
npm run test:agent
npm run check:content
npm run build:site
npx playwright install chromium
npm run test:browser
npm run test:site
npm run audit:public
```

Run the public audit after staging files in a Git checkout. For production, continue with the [Alibaba Cloud deployment guide](../deployment/).

The UTC+8 examples above describe the default policy. An operator can configure another business time zone independently; the portal displays the effective zone. Existing expiry instants do not change when switching interface language.
