---
title: "Dependency research and reusable code"
type: workflow
---

# Dependency research and reusable code

Before implementing, trace callers and inspect existing components/helpers, platform APIs and installed dependencies. Prefer extending established code. Small token/component changes can finish with this repository search.

Research external packages for substantial standard functionality, maintenance/security risk, or an explicit comparison request. Compare viable choices with a local implementation using official documentation and upstream code. Record exact capability, compatibility, license, maintenance, known advisories, version/lockfile changes, transitive impact and bundle/runtime cost. State uncertainty; popularity is one signal, not a security guarantee. Do not add abstractions, options or dependencies without a task requirement.

Use the [dependency decision](templates/dependency-decision.md) for meaningful decisions. Verify provenance and licensing before copying third-party code. Preserve checks, error handling, accessibility, security and data-loss protections.

At closeout of substantial work, briefly assess touched code for another credible consumer. Use the [reuse proposal](templates/reuse-candidate.md): stable API, product coupling, tests, provenance/license, extraction cost and maintenance owner. A reasoned no-candidate result is valid. Prepare proposals without creating speculative packages. Another repository, extraction/publication, ownership and license decisions require actual applicable [authorization](approvals.md).
