---
title: "Intelligence pilot enrollment"
type: engineering-plan
---

# Intelligence pilot enrollment

## Feature plan

Add an explicit operator-only command to provision one enabled source installation for a family and obtain the corresponding stable Messenger OIDC subject for an active user. Bind installation tenant, family, issuer and user transactionally. Repeated identical requests are idempotent; conflicting installations, inactive or cross-family users, invalid issuer and invalid identifiers fail closed. The command does not create a chat grant, start synchronization, alter restore state or contact a live service.

## Test plan

Use a disposable local PostgreSQL with minimal tables matching the migration contracts. First verify the command is absent, then exercise first enrollment, repeat stability, cross-family and inactive-user rejection, installation conflicts, and transaction rollback. Test CLI argument parsing and non-disclosure of database errors. No external instance is contacted. Build the existing operator executable and verify the unchanged backup commands.
