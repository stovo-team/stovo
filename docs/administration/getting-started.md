---
title: "Workspace administration"
type: administration
---

# Workspace administration

This guide is for people administering a running Stovo workspace. Deployment, infrastructure and recovery are covered separately in the [Compose](../self-hosting/docker-compose.md) and [Kubernetes](../self-hosting/kubernetes.md) guides. Menu availability depends on the signed-in account's role and permissions.

## After deployment

1. Complete the initial owner setup at the address configured by your operator. Subsequent registration is invite-based.
2. Open **Admin** to review the controls available to your account. The admin hub exposes sections according to permissions, including **Members**, **Roles** and **Server settings**.
3. Review member and role permissions before inviting people. Role settings can restrict actions such as chat creation, file sharing and creating invitations.
4. Coordinate backups, upgrade procedures and network configuration with the infrastructure operator. Keep the message-encryption key with the protected deployment secrets; the [Compose backup guide](../self-hosting/docker-compose.md#persistent-data-and-backups) explains what to preserve.

## Invite people and manage access

An account with invitation permission can use **Invite** in the Chats sidebar to create and copy or share an invitation link. The invitation dialog creates a member invitation with a preset expiry and use limit. Treat invitation links as access credentials and share them with the intended recipients.

Use **Admin → Members** to review members and their roles, and **Admin → Roles** to review or change role permissions when your account has access. Available actions depend on the actor's permissions and the target account. Ask an owner if an administrative section or action is unavailable.

## Calls and optional services

Call availability depends on the deployed media and network configuration. Transcription needs additional configuration and an external provider; see the [Compose guide](../self-hosting/docker-compose.md#calls-and-public-access) or [Kubernetes guide](../self-hosting/kubernetes.md). Self-hosting alone does not imply end-to-end encryption; consult the [security policy](../../SECURITY.md) and the deployment documentation for your version.

## Help members

Direct new members to [Get started with Stovo](../user-guide/getting-started.md). For deployment issues, check the troubleshooting section of your deployment guide. Report suspected vulnerabilities through the [security policy](../../SECURITY.md), not a public issue.
