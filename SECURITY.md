# Security policy

## Report a vulnerability privately

Please do not report suspected vulnerabilities in public issues, discussions, pull requests, or social media. Send a private report through [GitHub Security Advisories](https://github.com/stovo-team/stovo-messenger/security/advisories/new). If that private reporting form is unavailable, use a verified private contact method provided by the repository maintainers; do not post vulnerability details publicly.

Include a concise description, affected component or version if known, steps to reproduce, and potential impact. Use a test environment and sanitized proof of concept. Do not include real user data, credentials, encryption keys, or other secrets. Avoid actions that access, modify, or disrupt data belonging to others.

This project does not publish a guaranteed response time or a list of supported versions. Maintainers will assess reports as they are able and may ask for additional details through the private report.

## Secure deployment and operation

- **Secrets:** Keep production credentials out of source control, container images, logs, issue reports, and shell history. Use a secret manager or deployment platform secret store with narrowly scoped access. Replace any credential that may have been exposed, and review dependent services after rotation.
- **Message encryption key:** Protect `MESSAGE_ENCRYPTION_KEY` as a critical secret. Back it up separately and securely before deployment. Preserve access to the key needed to decrypt existing data. Do not rotate or replace it as an ordinary password: first establish the application's key migration behavior, test the procedure against a restorable copy, and retain the old key securely for as long as data encrypted with it must remain readable.
- **Encryption key format and custody:** Follow the format documented in the deployment guide and `.env.example`. Do not derive or invent a replacement format, publish the key, or reuse example values in production.
- **TLS:** Terminate external traffic with correctly configured TLS, keep certificates renewed, and use encrypted connections for remote database, object-storage, cache, and notification services where supported by the deployment.
- **Least privilege:** Give the application and operators only the permissions needed for their role. Restrict administrative interfaces and secret access, and use separate credentials for environments and services.
- **Data services:** Do not expose PostgreSQL, Redis, MinIO, or other internal service ports directly to the public internet. Place them on private networks and allow access only from the application and trusted administration paths.
- **Backups:** Back up databases, uploaded objects, configuration, and required encryption keys. Restrict backup access and storage, protect backups in transit and at rest, and periodically verify restoration in an isolated environment.
- **Logs and diagnostics:** Treat logs, crash dumps, and support bundles as potentially sensitive. Redact personal data, tokens, message content, and credentials before sharing them.

For contribution and disclosure guidance, see [CONTRIBUTING.md](CONTRIBUTING.md).
