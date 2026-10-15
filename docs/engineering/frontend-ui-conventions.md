---
title: "Frontend UI conventions"
type: guide
---

# Frontend UI conventions

Use the existing translation catalogs, components, and style tokens when changing the interface. This keeps wording and sizing consistent across screens and makes global changes predictable.

## Translations

- `frontend/src/config/strings/english.ts` defines the `AppStrings` shape. Add every new UI string to this file and `frontend/src/config/strings/russian.ts` in the same change.
- Read copy through `useStrings()` or a component's existing `strings` prop. Use interpolation functions for names and counts; do not assemble translated sentences from English fragments.
- Translate buttons, tabs, helper text, errors, empty states, placeholders, accessible names, and tooltips. Keep user content, URLs, file names, and protocol identifiers as data.
- Run `npm run check:i18n` and `npm test -- --run src/config/strings/strings.test.ts` from `frontend`.

## Components

Search for an existing component before creating another one. Shared UI should keep one implementation and expose variants or props when the behavior is genuinely shared. Use `rg` to search component names and styles; do not copy a component into a feature folder just to make a local adjustment.

## Style tokens

`frontend/src/design-system/tokens.css` is imported by `frontend/src/main.tsx` and owns the shared scales:

- Typography: `--font-family-ui`, `--font-family-mono`, `--font-size-*`, `--font-weight-*`, and `--line-height-*`.
- Corners: `--radius-small`, `--radius-control`, `--radius-surface`, `--radius-bubble`, `--radius-panel`, `--radius-pill`, and `--radius-circle`.
- Semantic colors: `--color-text-*`, `--color-background-*`, `--color-surface`, `--color-border`, `--color-accent`, status colors, and component roles such as Premium. These aliases resolve through the app's theme variables so theme switching remains authoritative. For new styles, use a semantic role instead of adding a one-off color. The current audit has not migrated every specialized illustration and preview color; do not treat those existing literals as approved patterns.

Use these variables in production CSS instead of raw font sizes, numeric font weights, or corner radii. Use semantic color aliases for authored UI surfaces and text. Intrinsic measurements such as icon dimensions, hit targets, media aspect ratios, and layout spacing are not typography or radius tokens. Keep genuinely content-specific values documented beside their regression test.

Run `npm test -- --run src/design-system/tokens.test.ts` from `frontend` after changing token-backed styles. Update style contract tests to assert the semantic token that controls the behavior rather than an old literal value.

## Reuse checklist

1. Search the catalog and existing components before adding copy or UI.
2. Add English and Russian catalog entries together.
3. Consume shared tokens for typography, theme colors, and corner shapes.
4. Add or update a regression test at the component or CSS contract layer.
5. Run the localization audit and focused tests for the changed surface.
