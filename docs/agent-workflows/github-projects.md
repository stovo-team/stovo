---
title: "GitHub Project, Milestone, and Rules Planning"
type: workflow
---

# GitHub Project, Milestone, and Rules Planning

Plan remote GitHub changes idempotently before making mutations. Read-only discovery identifies existing issues, milestones, Projects, and rulesets to propose only missing items. Applying mutations requires explicit human authorization, matching scopes, and verification through readback.

## Action scopes and permissions

Remote mutations are grouped into three distinct authorization scopes:

- `issues`: Create new task issues or milestones when missing.
- `projects`: Create GitHub Projects or configure status options on existing project boards.
- `administration`: Configure repository rulesets, such as required status checks and review requirements.

A plan records the exact required scope for every operation. Local preparation requires no write access; mutations proceed only when authorized.

## Discovery and planning

To generate a reproducible plan from repository state:

```sh
node scripts/agent-workflows/github-plan.mjs --repo <owner/repo> --desired <desired.json> --output <plan.json>
```

The planner performs read-only discovery:

- **Issue and milestone reuse**: Paginates through repository issues and milestones without `--slurp`. Reuses closed or open issues matching by title or stable comment marker `<!-- stovo-workflow:<key> -->`.
- **Project statuses**: Discovers existing Projects and their single-select fields. When configuring standard statuses (`Backlog`, `Ready`, `In progress`, `Review`, `Done`), all existing custom options and option IDs are preserved. If a Project does not exist, the plan creates it first and records a follow-up to review field IDs before updating statuses.
- **Repository rulesets**: Inspects existing rulesets targeting default branches. Administrative proposals preserve existing required status checks, retain stricter review counts, and add the stable aggregate check `Agent workflow gate`.

The plan output includes `schemaVersion: 1`, the repository, a discovery SHA-256 digest, and an array of planned operations with stable keys, `before`, and `after` states.

## Authorized application

Applying a reviewed plan is an explicit, host-supervised operation:

```sh
STOVO_GITHUB_APPROVED_PLAN_DIGEST=<plan-digest> node scripts/agent-workflows/github-apply.mjs --plan <plan.json> --digest <plan-digest> --source "<human session message>" --scopes "issues,projects,administration"
```

Safety constraints enforced during application:

1. **Digest verification**: The supplied digest must match `planDigest(plan)` and the approved plan digest environment variable.
2. **Scope authorization**: Every operation in the plan must fall within the explicitly authorized scopes.
3. **Optimistic concurrency**: Before applying each operation, current remote state is refreshed. If remote state changed unexpectedly since discovery, application fails closed.
4. **Readback verification**: Immediately after mutating remote state, the transport reads back the entity to verify that the desired state was satisfied.
5. **Idempotence**: Operations that are already satisfied remotely are skipped without error or duplicate mutations.
