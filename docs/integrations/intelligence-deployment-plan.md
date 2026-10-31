# Intelligence deployment routing

## Feature plan

Expose the existing root OIDC and Source v2 endpoints through the configured backend while preserving the default-disabled source gates. Pass confidential settings only to the explicitly selected tenant backend; do not grant access to other tenants. Preserve direct blue/green deployment support and the existing chat-scoped consent flow. Live activation and restore verification remain separate operational gates.

## Test plan

First test root routes and environment propagation with synthetic credentials, including a different tenant and default-off configuration. Verify red before implementation. Check the same backend receives OIDC and source requests, and that the settings reach the orchestrator and backend through Compose. Test clustered consent cookie paths separately, including rejected untrusted scope. Run the focused Go, configuration and browser tests without contacting a live Messenger or Intelligence instance.
