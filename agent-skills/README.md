# Stovo project skills

Canonical policy lives in [agent workflows](../docs/agent-workflows/approvals.md). These five entry points avoid duplicating Superpowers/Matt Pocock overall processes while retaining their specialized capabilities.

From the checkout root run:

```sh
node scripts/agent-workflows/install-skills.mjs --target .agents/skills --mode link --dry-run
node scripts/agent-workflows/install-skills.mjs --target .agents/skills --mode link
```

Copy mode supports environments without usable symlinks. Existing unrelated skills and conflicting names are preserved. A modified owned copy is a collision, not permission to overwrite. Start a fresh supported Codex session to check actual discovery; filesystem installation is not proof that an existing chat reloaded its catalog.

Personal installation is optional: preview the exact personal target with dry-run and obtain applicable authorization before changing it. The default installer changes only the checkout-local ignored directory and never edits plugin caches.
