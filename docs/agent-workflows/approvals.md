---
title: "Human approvals and task contracts"
type: workflow
---

# Human approvals and task contracts

Prepare concrete artifacts before requesting review. Reuse an existing human decision for the same reviewed contents and action scope. Read-only investigation, local test execution and commits within an authorized task need no additional check-in.

## Size the contract

- Focused defect: follow the [regression-first bug workflow](bug-fixes.md); record the reported behavior and regression evidence. Use feature planning only for a behavior redesign.
- Small feature: a short spec and test matrix in chat or a task page suffice. Give acceptance criteria stable IDs.
- New subsystem: write a spec, test plan and implementation plan with explicit scope, interfaces and risks.

Review the spec and test plan together before feature behavior changes. Include an implementation plan in the approved artifact set when it adds product/interface decisions. The human decision identifies the reviewed file contents or version, actor, source message/review and scope. A general agreement with an idea does not certify an unseen document.

## Preserve the decision

A machine-readable contract uses schema version 1, repository-relative artifact paths and SHA-256 digests. Record the actual human source and quote or review link. Local records document approval; they cannot authenticate themselves. Trusted session evidence and actual GitHub reviews remain the authority.

States are draft, awaiting-approval, approved, implementing, verified, ready-for-review and accepted. Verification binds passing required checks to exact source contents. Acceptance is a human decision. Missing infrastructure yields a blocked check, never an inferred pass.

A changed approved artifact requires a renewed acknowledgement of its new digest. Material scope, behavior, interface or security changes require substantive review. An editorial-only change can use a brief explicit equivalence acknowledgement. A validator must never silently bless a changed digest.

## Action scopes

Contract approval, local implementation, publication, issues/Project administration, merge and deployment are distinct scopes. The repository grants standing task-branch/PR publication authorization for implementation requests unless the user asks for local-only work; record that source and follow the delivery workflow. An explicit instruction can authorize several; preserve its boundaries and reuse it. Before an external mutation, check actual session authorization and tool permissions as well as any recorded scope. Agent-authored permission text is insufficient.

When a decision is needed, show the prepared artifact or proposed remote diff and explain what will happen. Continue independent authorized work while an unrelated decision remains pending.

## Delivery

Follow [testing](testing.md) and [isolation and delivery](isolation-and-delivery.md). Each acceptance ID maps to a check and an expected result. Evidence records failed, blocked and not-applicable outcomes with reasons. Readiness validation checks completeness and freshness; GitHub rules enforce remote review when configured.
