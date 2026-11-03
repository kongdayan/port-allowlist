---
title: Automatic device updates
description: Connect a device without sharing your customer or cloud credentials.
---

## Create a device token

In the customer portal, enter a device name under **Keep a device connected** and select **Create device token**. Copy the one-time token into a password manager. Continue using your customer access token to sign in to the website.

A device token can only renew that device's observed source address. The server ignores a requested source in the refresh body. The default lease is 60 minutes, renewed every five minutes by the scripts. Changing networks gives the old address a default 120-second grace period, limited by its previous validity.

## macOS

Download the macOS / Linux script from your own portal. The downloaded script follows the selected UI language. Read it, then run:

```sh
bash update-ip.sh --setup
```

Paste the device token at the hidden prompt. The script saves a private curl configuration and installs a five-minute per-user LaunchAgent. Each service origin has a separate profile under `~/.config/port-allowlist/` and a separate LaunchAgent label. The token is absent from process arguments.

To update immediately, run the downloaded script again. To remove the updater, first revoke its device in the portal, then unload the corresponding `org.port-allowlist.update-ip.*` LaunchAgent and remove that service's profile files.

## Linux

The same setup command saves the private token but does not configure a scheduler. Use cron or a user systemd timer to execute the installed script every five minutes. Setup prints the installed path. In `crontab -e`, use your actual absolute installed path:

```cron
*/5 * * * * /bin/bash <absolute-installed-script-path> >/dev/null 2>&1
```

Replace the placeholder before saving. Keep the script and token readable only by the intended user. Revoke the device before deleting the scheduler or profile.

## Windows

Download the Windows script from the customer portal and inspect it. In PowerShell:

```powershell
powershell -File update-ip.ps1 -Setup
```

The script prompts for the device token, encrypts its stored value with user-bound DPAPI, and creates a five-minute task for the current interactive user. It does not change the machine-wide execution policy. Keep using the same Windows account. Remove its `PortAllowlist-UpdateIP-*` scheduled task and profile after revoking the device.

Windows real-device scheduled-task acceptance remains pending. Script delivery and language selection are tested; do not treat that as Windows runtime validation.

## Network and troubleshooting

The scripts call your portal through IPv4 HTTPS with explicit timeouts and do not follow redirects. They bypass environment HTTP proxies to observe the device's direct IPv4 route; a system VPN may still determine the egress. If your network has no usable IPv4 path, manual registration or a network change is required.

An offline device eventually loses its lease **when a working synchronizer reconciles expiry**. If the agent is stopped, already-applied cloud rules do not expire by themselves. See [failure behavior](../security/).

A token error means the key may be revoked, the customer disabled, or the wrong portal used. Never paste a token, private configuration or actual source address into a public issue. Share only a redacted stable error code and platform version.
