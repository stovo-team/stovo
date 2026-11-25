# Application

<!-- okf:generated:start -->
## Generated facts
- Languages: Go, JavaScript
- Framework hints: Node.js
<!-- okf:generated:end -->

## Curated domain model & security invariants

1. **Tenant Isolation**: Every database query and business operation must be explicitly scoped by `family_id` (tenant ID). Unscoped queries on multi-tenant tables are strictly forbidden.
2. **Secret Redaction**: Secrets, private keys, and passwords must never be logged or serialized in plain text.
3. **Replay Protection**: Real-time interactions and webhook events enforce replay prevention via nonce/timestamp tracking.
4. **Content Security**: Raw HTML injection (`dangerouslySetInnerHTML`) is prohibited unless sanitized via DOMPurify.
