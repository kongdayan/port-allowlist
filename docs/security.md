# Security model

## Boundaries

One deployment protects one operator-configured TCP port in one ECS security group. End users never submit a port, group ID, region or Alibaba credentials. Only the ECS-local agent has cloud credentials. It accepts only three ECS actions; its target comes from local configuration. The Worker keeps SHA-256 hashes of customer / device / operator / agent tokens, and hashed session tokens. Raw API tokens appear only at issuance or in your private setup files.

Customer hosts are bound to a customer server-side. Operator / agent endpoints are unavailable there. A customer token cannot view another customer's grants or log in at the operator hostname; a device token can refresh only its own current source. Browser sessions use HttpOnly, Secure, SameSite=Strict cookies and same-origin checks for writes. API bearer tokens must be handled as credentials. Changing a customer token invalidates old customer sessions.

The default deployment-wide active-address ceiling is 180, reserving room below the agent's 200-entry policy guard. Real security-group quotas can be smaller and include unmanaged rules: check your account before enabling a large customer quota. Customer quotas count grants and delegated existing source rules; a network rule counts as one rule, not every address in its CIDR. Provider API errors remain visible as synchronization errors; they never justify widening access.

## Ownership and deletion

New rules are exact-port TCP ingress, with a distinct project-owned description prefix and a canonical-address hash. New addresses are staged and verified before old owned rules are removed. An invalid / oversized / wrong-port policy is rejected before cloud changes. Expired grants are excluded, including expired addresses in a cached policy.

Unmanaged rules are retained by default. Optional exclusive port ownership lets one customer request deletion of a particular rule from reported inventory. A SHA-256 fingerprint binds the request to rule ID, direction, protocol, port, source, priority and description; stale or mismatched rules cannot be deleted through this path. Explicitly selected legacy networks are replaced with any still-required exact grants before deletion. Rules spanning port ranges are never eligible.

The cloud IAM policy is a separate authorization boundary. Do not assume the Python guards can constrain someone who has stolen the underlying Alibaba credentials. Follow the [RAM scoping notes](deployment.md#2-prepare-an-ecs-security-group).

## Failure behavior

- Control-plane timeout: reconcile the last validated snapshot using its original expiries; do not extend leases.
- No validated snapshot: make no policy changes.
- Failed / unconfirmed addition: preserve old access; do not proceed with deletion.
- Agent process, host, network or credentials unavailable: cloud rules persist as they were. Security-group rules do not have a native lease expiry here. Run independent health / stale-policy alerts and recovery procedures if expiry guarantees matter.
- Existing unmanaged rules retain their own lifecycle until explicitly deleted. They can allow traffic beyond a portal grant's expiry. Another attached security group can also allow traffic; audit the combined policy.
- Revocation controls new connections. Security-group connection tracking can keep an existing TCP session alive. Application session termination is outside this project.

## Network identity and telemetry

An IP allowlist authorizes a public network egress, not a person. Devices sharing NAT / VPN egress share access. Continue using authentication and encryption in the TCP service itself.

Telemetry is filtered by a customer's currently permitted sources. People sharing one egress may therefore share the same source-level activity view. Do not offer this as person-level or strict per-device traffic accounting. `ss` byte deltas describe observable sockets, not provider billing or full end-to-end health. The diagram shows a logical topology and animation indicates observed connections.

Cloudflare stores source addresses and operational audit data as part of the product. Events are pruned after 7 days, audit after 30 days, telemetry history after 1 day; cleanup runs hourly. Grant / inventory records remain until operator maintenance or database deletion. Local agent state / optional session logs also contain source addresses; protect and rotate them. Avoid source addresses or tokens in diagnostics and public issues. This repository contains no production inventories, customer domains, literal IP addresses, or deployment credentials.

## Known limitations

IPv4 and TCP only; one ECS group per deployment; no built-in short-lived credential refresh; no guaranteed expiry if the synchronizer is down; no automatic cleanup in other groups; no active termination of established sessions; Windows updater runtime acceptance pending. Local tests use generated synthetic fixtures and fake cloud providers; a fresh deployment must pass real add / revoke and service-preservation checks in its own account.

For sensitive reports use the repository owner's private GitHub contact channel or security advisory interface if enabled. Never post working credentials, addresses, customer data or request bodies in a public issue.
