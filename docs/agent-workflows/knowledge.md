---
title: "Repository knowledge lifecycle"
type: workflow
---

# Repository knowledge lifecycle

Use OKF at the start of every repository task and before delivery. The tracked
`.okf/` bundle routes to the canonical pages in `docs/`; maintain those pages
alongside code. Preserve curated content outside `okf:generated` blocks.

## Setup

Install the repository's pinned CLI when it is missing:

```sh
pipx install "git+https://github.com/left-try/okf-agent.git@ed3a192d0e44437a446d51d02781a3fa9a5cda93"
```

From the task checkout, run:

```sh
node scripts/agent-workflows/prepare-knowledge.mjs start
```

This uses supported `okf-agent index`, `docs build`, and `bundle update` commands,
then validates both knowledge profiles and the generated wiki. It safely bootstraps
missing knowledge with `index`; `init` also installs instruction adapters and is
unnecessary for a checkout containing the maintained bundle. Missing tools or failed
checks stop preparation with an actionable error.

Read `.okf/index.md` and retrieve relevant context before planning or editing:

```sh
okf-agent bundle search "backup restore" --root docs --index-root .okf-index/docs
okf-agent bundle backlinks architecture/subsystems.md --root docs --index-root .okf-index/docs
```

Use `okf.get_change_context` when the repository MCP profile is connected. Otherwise
combine bundle search with source inspection. Quote hyphenated search phrases.

## Maintain and verify

When code changes a documented fact, update the existing page and its links.
Add a page only for new knowledge; add its entry to `docs/README.md`. Before delivery:

```sh
node scripts/agent-workflows/prepare-knowledge.mjs finish
node scripts/agent-workflows/prepare-knowledge.mjs check
okf-agent doctor .
```

`finish` updates generated facts and local change context, rebuilds the code map
and documentation indexes, and validates them. `check` reports stale repository
wiki output and validates canonical Markdown metadata. Bundle link diagnostics
are reported by OKF; inspect them for the pages changed by the task.

All outputs under `.okf-index/` and `.okf/changes/current.md` are disposable and
ignored. Open `.okf-index/wiki.md` for navigation to every canonical docs page
and a source map with checkout-relative links. `okf-agent docs serve .` serves the repository
knowledge pages and code map; its current renderer does not include `docs/` pages.
The separate docs bundle provides their full-text search and backlinks.

## Git refresh

The maintained `.githooks/post-checkout` and `post-merge` hooks refresh knowledge
when enabled through the repository's local `core.hooksPath`; pre-commit refreshes and blocks stale or malformed knowledge. They warn on failure;
a task must still complete the explicit start/finish checks. Git hooks do not run
when an existing chat receives another task, so agent startup instructions remain
necessary. Preserve an existing hook manager; integrate these hooks into it.

```sh
git config --local core.hooksPath .githooks
```

This enables the existing architecture and commit-message hooks too. Hooks do not
launch agents, install global settings, stage files, or publish changes.
