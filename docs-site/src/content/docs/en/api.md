---
title: API reference
description: Roles, authorization routes, stable errors and synchronization metadata.
---

Use JSON bodies and `Authorization: Bearer <token>` for scripts. Never place credentials in query strings. Browser login uses a secure session cookie instead. All customer calls must use that customer's bound hostname.

| Method / path                          | Identity                           | Purpose                                                               |
| -------------------------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| `GET /api/portal`                      | Public                             | Branding, mode and managed port for this hostname                     |
| `POST /api/login`                      | Operator / customer token in `key` | Browser session; host binding is enforced                             |
| `POST /api/logout`                     | Browser session                    | Revoke the session                                                    |
| `GET /api/ip`                          | Customer / operator                | Detect current Cloudflare-observed source; usable IPv4 if available   |
| `GET /api/dashboard`                   | Customer / operator                | Tenant-scoped grants, devices, inventory and telemetry                |
| `POST /api/leases`                     | Customer / operator                | Add `{ip, label, days:30}` or `{ip, label, expire_date:"YYYY-MM-DD"}` |
| `PATCH /api/leases/:id`                | Owning customer / operator         | Renew a manual grant using `days` or `expire_date`                    |
| `DELETE /api/leases/:id`               | Owning customer / operator         | Revoke a grant; audit record is retained                              |
| `POST /api/devices`                    | Customer / operator                | Create `{name}`; returns one-time device key                          |
| `DELETE /api/devices/:id`              | Owning customer / operator         | Disable the device, its key and grants                                |
| `POST /api/device/refresh`             | Device only                        | Grant its observed public IPv4 and renew its lease                    |
| `DELETE /api/firewall-rules/:ref`      | Delegated owner / operator         | Request deletion of an exact-port legacy rule                         |
| `POST /api/admin/customers`            | Operator only                      | Create `{name}`, returns ID and one-time customer key                 |
| `PATCH /api/admin/customers/:id`       | Operator only                      | Quotas, enablement, name and lease policy                             |
| `POST /api/admin/customers/:id/key`    | Operator only                      | Rotate customer login key; omit `token` to generate a random one      |
| `POST /api/admin/customers/:id/portal` | Operator only                      | Bind `{hostname, manage_existing_rules:false}`                        |
| `GET /api/agent/desired`               | Agent only                         | Port-pinned grants with original expiries and explicit deletion refs  |
| `POST /api/agent/report`               | Agent only                         | Report inventory / status / bounded telemetry                         |

Administrator calls that act on a customer pass its ID in `customer_id`; dashboard selection uses `?customer=<id>`. The customer portal never receives internal customer IDs or operational configuration. A successful grant creation means pending policy; rely on the dashboard's applied state and a real TCP check for acceptance. Deleting an existing rule returns HTTP 202 until agent inventory confirms its absence. Conflicts return HTTP 409. Keys, bodies and source addresses must be redacted from diagnostic logs.

Default manual authorization expires at **00:00 UTC+8 on the selected date**, so selecting a date does not include that day's daytime. Defaults are 30 calendar days and a maximum of 365. The business time zone is configured independently with `--time-zone`, defaulting to `Asia/Shanghai` (UTC+8). Automatic devices default to 60-minute leases with 120-second address-change grace, configurable by the operator.

## Stable error contract

Error responses are JSON objects with `code`, `params` and an English `error` fallback. The UI translates `code` locally; it never renders raw provider diagnostics. Example:

```json
{
  "code": "AUTHORIZATION_LIMIT_REACHED",
  "params": {},
  "error": "The authorization limit has been reached. Remove another grant first."
}
```

`NUMBER_OUT_OF_RANGE` carries numeric `min` / `max`; `DATE_OUT_OF_RANGE` carries numeric `max`. Other errors currently have empty parameters. HTTP status semantics are preserved: 400 validation, 401 authentication, 403 authorization / origin, 404 inaccessible resource, 409 conflict, 413 size, 429 rate limit, 500 internal error. Unexpected exceptions return `SERVICE_UNAVAILABLE`.

The source of truth is `shared/errors.ts`. English / Chinese descriptions and placeholder parity are verified together with UI translation keys in CI. Device updater errors also return these stable codes; do not parse translated prose.

## Synchronization metadata

Dashboard adds `synchronization.state` (`unavailable`, `ready`, `dry_run`, `stale`, `error`), `updated_at`, and `last_reconciled_at`. Customer metadata never includes raw cloud error strings. A revoked lease with `removal_pending=true` has not yet been confirmed by a successful apply reconciliation after its revocation. Existing-rule removal remains pending until inventory reports absence. A lease's existing `applied` field retains its recent-inventory semantics.

Script downloads accept `?lang=en` or `?lang=zh-CN`. Unsupported or absent locales use English. Only fixed reviewed strings are localized; the host origin is supplied by the download route, and no device token is embedded.
