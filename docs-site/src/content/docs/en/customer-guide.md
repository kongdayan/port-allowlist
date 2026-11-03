---
title: Customer guide
description: Add networks, choose an expiry date, and understand synchronization.
---

## Sign in to your own portal

Your operator gives you a dedicated hostname and one customer access token. Use that hostname: the operator portal rejects customer tokens, and another customer's portal rejects yours. Device tokens are only for automatic updates and cannot sign in here.

The header offers English / Simplified Chinese, light / dark appearance, and sign out. Language changes preserve form input and do not change the UTC+8 business time zone.

## Authorize your current network

1. Select **Get current IP**. The server derives your address from Cloudflare's connecting-IP header.
2. Select **Authorize this network** to fill the authorization form with the detected public IPv4. You can edit the address, network name and expiry before submitting.
3. Select **Add authorization**, then inspect its synchronization status.

If you are behind a VPN, this detects the VPN egress. Shared office or home NAT means several devices may share access. If no public IPv4 can be detected, enter the network's public IPv4 manually or use the device updater over IPv4. Private / reserved addresses and network ranges are not accepted.

## Choose an expiry date

Manual grants default to 30 calendar days, capped by the operator's policy. Enter the number of days, select a preset, or choose an exact expiry date. Days and date stay synchronized.

**A selected date expires at 00:00 UTC+8 at its beginning.** It does not include that day's daytime. The form shows this explicitly before submission. Browser time zone and interface language do not affect it. Automatic devices use heartbeat-based leases instead.

Use **Change expiry** on a manual grant to extend or reactivate it within the current account quota. Search by name or address, or filter active, pending and expired authorizations. On a phone, each authorization is presented as a card.

## Understand the status

| Authorization state | What it means                                            | Next action                                         |
| ------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| Submitted           | The API accepted the change                              | Wait for synchronization                            |
| Synchronizing       | ECS has not confirmed the current policy                 | Check the authorization-service status              |
| Applied             | Recent agent inventory covers the active address         | Test a new business connection                      |
| Removing            | The request was revoked; ECS confirmation is pending     | Wait or ask the operator to restore synchronization |
| Sync failed         | Reports are overdue or the synchronizer reports an error | Refresh or contact the operator                     |
| Expired             | The grant has passed its business expiry                 | Renew it if still needed                            |

Authorization-service status is separate: **Not connected**, **Preview mode**, **Synchronized**, **Report overdue**, or **Synchronization failed**. Preview mode intentionally makes no cloud changes. A green synchronization state confirms policy synchronization, not application login or end-to-end service health.

## Remove access

Select **Delete** and review the source in the confirmation dialog. Removing an existing firewall rule stays pending until agent inventory confirms that exact rule is absent. A revoked manual grant can remain as **Removing** until a successful reconciliation confirms processing.

Deleting a device's current grant does not permanently disable the device: its next heartbeat may authorize it again. To stop future updates, choose **Revoke device**.

Security groups can preserve established TCP sessions through connection tracking. Test revocation with a **new connection**. A shared source or another valid grant can still permit the same network; IP authorization is not individual identity.

## Read activity and diagrams

Recent activity groups ended sessions by source; expand a row for recent timestamps, duration and byte counts. It requires the optional ECS session log. Live connections and transfer rates come from socket counters. Missing samples appear as gaps, not fabricated zero traffic. Firewall-rejected connections never reach these session logs.

The node diagram is a logical path. Moving connectors indicate observed connections only. Neither it nor the architecture diagram claims to trace the exact network route.

The customer view does not expose other customers, account tiers, RAM identities, security-group IDs, cloud credentials or raw operator diagnostics.

The UTC+8 examples above describe the default policy. An operator can configure another business time zone independently; the portal displays the effective zone. Existing expiry instants do not change when switching interface language.
