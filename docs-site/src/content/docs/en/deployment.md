---
title: Alibaba Cloud deployment
description: Deploy the Cloudflare portal and the restricted ECS synchronizer.
---

## 1. Configure the Worker

Run `npm ci` and `npm run setup` first. Keep Node.js 22.23.4+ available. Cloudflare CLI and Vite versions are pinned in the lockfile; the CLI is currently beta.

`npm run setup` accepts:

| Option            | Meaning                                                     | Default                  |
| ----------------- | ----------------------------------------------------------- | ------------------------ |
| `--operator-host` | Operator / agent hostname; also attached as a custom domain | local operator hostnames |
| `--client-host`   | Customer hostname attached to the Worker                    | none                     |
| `--port`          | The only TCP port this deployment manages                   | 10800                    |
| `--brand`         | Neutral operator branding shown in the portal               | Port Access              |
| `--worker`        | Cloudflare Worker name                                      | port-allowlist           |

The resulting `.local/project.json` is intentionally ignored because deployment domains may identify customers. `domains` is the custom-domain list; `operator_hosts` is the comma-separated host allowlist for privileged APIs. All other hostnames require an enabled customer mapping. Adding a client requires both attaching its hostname to the Worker and binding it through the bootstrap command. Do not bind an operator hostname to a customer.

Use custom domains in your own Cloudflare-managed zone. `workers.dev` is disabled. For multiple independent deployments, use separate checkouts, Worker names, credentials, and agent state directories. Changing the port creates a separate coordination object; it does not migrate or clean up the old port. Export and deliberately remove old rules before retiring a deployment.

```sh
npm run setup -- --operator-host access.example.com --client-host team.example.com --port 10800 --brand 'Your Network'
npx cf auth login
npm run deploy -- --dry-run
npm run deploy
npm run bootstrap -- --url https://access.example.com --client-host team.example.com --name 'Your Team' --quota 100
```

`cf deploy --secrets-file` sends only the two token hashes to Cloudflare. Raw administrator / agent tokens remain in `.local/credentials.json`. Customer creation returns its token once; bootstrap saves it to `.local/client.json` before subsequent configuration so a partial failure can be retried without losing it. Re-running bootstrap updates that saved customer; create additional customers through the operator UI/API.

The local hostnames are `localhost` (operator) and `client.localhost` (customer). Chromium treats localhost origins as trustworthy for local development. If your browser or resolver cannot reach a subdomain of localhost, use Chromium or add that hostname to your local hosts file. Production requires HTTPS.

## 2. Prepare an ECS security group

1. Choose one security group and one TCP port. Prefer a group dedicated to this service, attached only to intended ECS network interfaces.
2. Audit every security group attached to the instance: another group allowing broad access can bypass this allowlist. A broad port-range rule is not narrowed or deleted by this agent.
3. Save an encrypted / access-controlled copy of existing rules and preserve an independently tested SSH / console access path.
4. Confirm the business process already listens on the selected port. This project does not install or reconfigure your TCP service.
5. Create a dedicated RAM identity with only `ecs:DescribeSecurityGroupAttribute`, `ecs:AuthorizeSecurityGroup`, and `ecs:RevokeSecurityGroup`. Scope to the target group where the provider supports it; use the official resource-scoping policy example and validate read / add / revoke in your own account. Do not grant ECS or RAM full access.

Provider documentation currently differs on resource scoping for `AuthorizeSecurityGroup`: the API permission table lists all resources, while the RAM management guide includes a group-scoped example. Do not silently expand a failed group-scoped policy to all resources; resolve this in your account and document the resulting boundary. The agent's fixed target and port are application guards, not a replacement for RAM authorization.

Official references: [group-scoped RAM example](https://help.aliyun.com/en/ram/manage-ecs-security-groups-within-an-alibaba-cloud-account), [AuthorizeSecurityGroup](https://www.alibabacloud.com/help/en/ecs/developer-reference/api-ecs-2014-05-26-authorizesecuritygroup), [RevokeSecurityGroup](https://help.aliyun.com/en/ecs/developer-reference/api-ecs-2014-05-26-revokesecuritygroup).

## 3. Install the agent on ECS

Requirements: Linux with systemd, Python 3.10+, `iproute2` / `ss`, outbound HTTPS to the operator hostname and regional ECS API. No inbound management API is opened on ECS. Package names differ by distribution.

Copy `agent/` to ECS using your existing authenticated SSH connection. **Create the Alibaba credential file on ECS, not in the website project.** Copy `agent/config.example.json` to a private working file and set `control_url`, `region`, `security_group_id`, and the same `port` as the Worker. Keep `apply` set to the JSON boolean `false`.

On ECS:

```sh
umask 077
cp agent/config.example.json config.json
cp agent/credentials.env.example agent.env
chmod 600 agent.env
# Edit config.json and agent.env using an editor on ECS.
python3 agent/install.py --config config.json --credentials agent.env
sudo python3 agent/install.py --config config.json --credentials agent.env --install
sudo python3 /opt/port-allowlist/agent.py --config /etc/port-allowlist/config.json --env-file /etc/port-allowlist/credentials.env --check-cloud
sudo systemctl enable --now port-allowlist
sudo journalctl -u port-allowlist -n 30 --no-pager
```

`agent.env` contains `PROXY_ACCESS_AGENT_KEY` (the generated agent token), `ALIYUN_ACCESS_KEY_ID`, and `ALIYUN_ACCESS_KEY_SECRET`. Optional `ALIYUN_SECURITY_TOKEN` supports externally supplied STS credentials, but **automatic ECS RAM-role / STS refresh is not implemented**. Provision a credential rotation process if using expiring tokens. Do not use your root account access key.

The installer previews by default, refuses to overwrite an existing installation, requires a private credential file, and requires `apply=false`. `--install` only copies files / creates the dedicated system user / reloads systemd; it does not start the service. The unit reads root-owned credentials through systemd; the agent runs without root, with memory / CPU limits. Region and security-group IDs never go to Cloudflare.

## 4. Enable writes deliberately

1. In dry-run mode, confirm the portal sees the agent; inspect the existing-rule inventory in the portal and request an owner-only dry-run plan with `sudo python3 /opt/port-allowlist/agent.py --config /etc/port-allowlist/config.json --env-file /etc/port-allowlist/credentials.env --once --plan-file /root/port-allowlist-plan.json`. The destination must not already exist. This JSON contains sensitive source addresses; inspect it locally and never publish it. The agent logs counts and errors, not credentials or source addresses.
2. Test one disposable authorization from a separate machine with an actual public IPv4 egress. Confirm the desired policy is for the correct port. Decide whether you need to delegate existing-rule deletion (below).
3. On ECS, edit `/etc/port-allowlist/config.json` and change `apply` to the JSON boolean `true`; restart `port-allowlist`.
4. Verify the new cloud rule and a **new** business TCP connection end to end. Revoke the test authorization and confirm a new connection is blocked. An already-established connection may survive due to security-group connection tracking.
5. Compare unrelated port rules, SSH reachability, business-process listeners and Docker state against your baseline. Remove temporary tests.

Do not delete broad existing rules before staging the needed exact replacements. Automatic replacement adds and verifies new managed rules before deleting old managed rules. It never edits unrelated ports, UDP, egress, all-protocol rules, or port ranges. Deleting an existing unmanaged rule requires an exact-port match and a fingerprint from the latest inventory.

## 5. Optional: delegate existing exact-port rules

By default unmanaged rules are preserved. To give one customer control over existing **exact-port TCP ingress** sources:

```sh
npm run bootstrap -- --url https://access.example.com --client-host team.example.com --name 'Your Team' --manage-existing
```

This delegation is exclusive for the port. The customer can then click delete for a specific existing rule. The agent verifies its fingerprint and rule ID, stages replacements for still-active grants, revokes the requested cloud rule, and reports inventory. Other legacy rules stay in place. This can remove access immediately for other people sharing that source address: check ownership before delegating.

## 6. Optional session history and real traffic

Live connections / byte deltas come from Linux `ss` for the configured port; they do not require modifying the application. Container network namespaces, kernel counter availability and elevated read restrictions can affect sampling; verify visibility on your host. Missing samples are shown as unavailable, not zero measured traffic.

Ended-session cards are optional and read a newline-delimited JSON log. For an existing Nginx `stream` service, the following **example** can be adapted inside the appropriate context:

```nginx
log_format port_allowlist escape=json
  '{"ts":"$time_iso8601","ip":"$remote_addr","bytes_up":$bytes_received,"bytes_down":$bytes_sent,"duration":$session_time,"status":"$status"}';
access_log /var/log/port-allowlist/sessions.log port_allowlist;
```

Configure a rotation policy and narrowly grant the `port-allowlist` user read access to that file and directory. Validate with `nginx -t` before reloading. The installer does not modify Nginx. Without that log, live sampling still works and ended-session cards are empty. Do not add full request URLs, destinations or payloads to the log.

## 7. Customer automatic updater

Create a device in the customer portal and save its one-time device token. Download the platform script from that same portal. On macOS / Linux run `bash update-ip.sh --setup` and enter the device token at the hidden prompt. macOS registers a per-user LaunchAgent; Linux needs your own 5-minute scheduler. Windows uses DPAPI for the saved key and a per-user scheduled task. Read the script before running it; Windows real-device validation remains outstanding.

The updater uses IPv4 HTTPS. The Worker derives the address from Cloudflare's connecting-IP header; a client cannot choose a different address in the refresh request body. Behind a VPN this authorizes the VPN's public egress. Idle / offline devices lose their default 60-minute lease once the agent reconciles expiry. Default migration grace is 120 seconds, never beyond the old grant's validity.

## 8. Upgrade, rollback and recovery

- Back up the ECS unit, config, script and state with owner-only access before upgrading; stop the service while replacing its code and restart after checks. The first-install script refuses upgrades to avoid accidental overwrite.
- Export / back up Durable Object SQLite data through Cloudflare before schema changes. Schemas initialize transactionally and use additive migrations; tests exercise upgrade persistence. Do not rename the coordination object / Worker casually.
- Roll back Worker code through Cloudflare's version controls and restore the matching agent backup. Restoring an older database backup can restore revoked grants: reconcile the intended policy before enabling apply.
- Stopping the agent does not remove cloud rules. Disabling apply also leaves the last applied cloud state unchanged. For decommissioning, revoke grants while the agent runs, verify removal of owned rules, review preserved legacy rules, then stop it.
- For recovery, use your separately preserved administrative path. Never use a global allow rule as the application's error fallback.
- Retain `.local` securely outside Git. Losing the customer token requires rotation through the admin API; losing the administrator token requires updating its hash and issuing a replacement token. A changed admin hash invalidates existing administrator sessions.

## Documentation and demo hosting

`npm run build:site` assembles the bilingual Starlight site and the isolated demo in `site-dist/`. The repository Pages workflow publishes that directory after checks. It contains no Worker bundle or server credentials. Set `GITHUB_REPOSITORY` when building a fork, or use `DOCS_SITE_URL` and `DOCS_BASE_PATH` to configure its host and base path; update the documentation links in the portal and README for your fork.

The production portal remains a separate Cloudflare deployment. Publishing documentation never applies ECS firewall changes. v0.2 supports Alibaba Cloud only.

## Independent business time zone

`npm run setup -- --time-zone Asia/Shanghai` selects the default UTC+8 policy; `--time-zone UTC` or a supported IANA name such as `America/New_York` selects another business calendar. This is independent of browser language and location. Redeploy the configured Worker after a policy change.

New manual grants and renewals expire at the start of the selected business date. Daylight-saving boundaries use calendar days, not fixed 24-hour additions; if midnight is skipped, the first valid instant of that date is used. A calendar date skipped entirely by a zone is rejected. Existing absolute expiry timestamps are not rewritten by a zone change. The UI formats observations in the selected business zone and shows that zone explicitly.
