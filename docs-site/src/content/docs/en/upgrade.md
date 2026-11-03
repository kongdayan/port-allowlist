---
title: Upgrade & recovery
description: Move from v0.1 to v0.2 without losing grants, tokens or access.
---

## What changes in v0.2

The customer portal is rebuilt with typed React components, English / Simplified Chinese, responsive authorization cards and preserved form / activity state during polling. Synchronization has distinct states, and the API supplies stable error codes and safe parameters. Script downloads follow the selected language.

Existing customer grants, customer host mappings, token hashes and the UTC+8 expiry contract remain valid. The dashboard adds `synchronization` and per-lease `removal_pending`; errors retain an English `error` fallback and add `code` / `params`. Consumers should use codes rather than parse human text.

No new cloud provider, Terraform module or automatic credential refresh is introduced. The ECS rule reconciler's firewall behavior is unchanged by this UI release.

## Before upgrading a live installation

1. Record the running Worker version, agent version, selected port and an access-controlled export of current rules. Preserve an independently tested administrative SSH / console path.
2. Back up SQLite data using Cloudflare's tooling. Back up the ignored local setup files and ECS config, environment, service unit and agent state with private permissions. Do not attach these files to GitHub issues.
3. Verify a candidate checkout with the tests listed in the quick start. Preserve the configured Worker name and port; both participate in locating the existing database.
4. Copy only your own ignored `.local/project.json`, `.local/credentials.json`, `.local/worker-secrets.json` and `.dev.vars` into the new checkout through a secure local process. Do not run a fresh initialization over an unrelated deployment or regenerate active tokens casually.

## Publish the application

In your configured checkout:

```sh
npm ci
npm run build
npm run check
npm test
npm run test:agent
npm run deploy -- --dry-run
npm run deploy
```

Verify the custom hostname, customer login, existing grants and a new disposable grant using the actual service. Test deletion with a new connection, then clear the test. Check unrelated rules, business listeners, SSH and Docker against the pre-upgrade baseline.

The UI release can use the existing agent. Old reports lacking `last_apply` leave revoked grants in a pending confirmation state; restore a current agent report to confirm processing. Agent upgrades require a deliberate backup and replacement: the first-install script refuses to overwrite an installation.

## Roll back

Restore the previous Worker version through Cloudflare and, if changed, the matching backed-up agent files. Use your preserved administrative route if the portal is unavailable. Re-enable apply only after confirming the intended policy and selected port.

Restoring an old database snapshot may restore previously revoked grants. Review the policy before resuming writes. Do not add a global allow rule as a recovery shortcut.

## Decommission

Revoke grants while the synchronizer is running, confirm owned rules are removed, review all preserved legacy rules, then stop the service. Stopping the agent or switching to dry-run **does not delete already-applied rules**. Retire device tokens and customer tokens separately.
