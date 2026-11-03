# API essentials

Use JSON bodies and `Authorization: Bearer <token>` for scripts. Never place credentials in query strings. Browser login uses a secure session cookie instead. All customer calls must use that customer's bound hostname.

| Method / path | Identity | Purpose |
|---|---|---|
| `GET /api/portal` | Public | Branding, mode and managed port for this hostname |
| `POST /api/login` | Operator / customer token in `key` | Browser session; host binding is enforced |
| `POST /api/logout` | Browser session | Revoke the session |
| `GET /api/ip` | Customer / operator | Detect current Cloudflare-observed source; usable IPv4 if available |
| `GET /api/dashboard` | Customer / operator | Tenant-scoped grants, devices, inventory and telemetry |
| `POST /api/leases` | Customer / operator | Add `{ip, label, days:30}` or `{ip, label, expire_date:"YYYY-MM-DD"}` |
| `PATCH /api/leases/:id` | Owning customer / operator | Renew a manual grant using `days` or `expire_date` |
| `DELETE /api/leases/:id` | Owning customer / operator | Revoke a grant; audit record is retained |
| `POST /api/devices` | Customer / operator | Create `{name}`; returns one-time device key |
| `DELETE /api/devices/:id` | Owning customer / operator | Disable the device, its key and grants |
| `POST /api/device/refresh` | Device only | Grant its observed public IPv4 and renew its lease |
| `DELETE /api/firewall-rules/:ref` | Delegated owner / operator | Request deletion of an exact-port legacy rule |
| `POST /api/admin/customers` | Operator only | Create `{name}`, returns ID and one-time customer key |
| `PATCH /api/admin/customers/:id` | Operator only | Quotas, enablement, name and lease policy |
| `POST /api/admin/customers/:id/key` | Operator only | Rotate customer login key; omit `token` to generate a random one |
| `POST /api/admin/customers/:id/portal` | Operator only | Bind `{hostname, manage_existing_rules:false}` |
| `GET /api/agent/desired` | Agent only | Port-pinned grants with original expiries and explicit deletion refs |
| `POST /api/agent/report` | Agent only | Report inventory / status / bounded telemetry |

Administrator calls that act on a customer pass its ID in `customer_id`; dashboard selection uses `?customer=<id>`. The customer portal never receives internal customer IDs or operational configuration. A successful grant creation means pending policy; rely on the dashboard's applied state and a real TCP check for acceptance. Deleting an existing rule returns HTTP 202 until agent inventory confirms its absence. Conflicts return HTTP 409. Keys, bodies and source addresses must be redacted from diagnostic logs.

Default manual authorization expires at **00:00 UTC+8 on the selected date**, so selecting a date does not include that day's daytime. Defaults are 30 calendar days and a maximum of 365. Time-zone behavior is fixed to UTC+8 in this release. Automatic devices default to 60-minute leases with 120-second address-change grace, configurable by the operator.
