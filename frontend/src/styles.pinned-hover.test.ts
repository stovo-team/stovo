import { readCssSource } from "./test/cssSource";
import { expect, it } from "vitest";

it("keeps the pinned-message action clickable without hover feedback", () => {
  const css = readCssSource("src/styles.css");
  const banner = css.match(/^\.pinned-banner\s*\{([^}]*)\}/m)?.[1] ?? "";
  const action = css.match(/\.pinned-banner-click-area\s*\{([^}]*)\}/)?.[1] ?? "";
  const hoverFeedback = css.match(/\.pinned-banner-click-area[^{}]*:hover[^{}]*\{([^}]*)\}/);
  const focusFeedback = css.match(/\.pinned-banner-click-area:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(banner).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
  expect(banner).toMatch(/padding:\s*0;/);
  expect(action).toMatch(/min-height:\s*0/);
  expect(action).toMatch(/border-radius:\s*inherit/);
  expect(hoverFeedback).toBeNull();
  expect(focusFeedback).toMatch(/background:\s*var\(--surface-hover\)/);
});

it("keeps the pinned banner click area visually unchanged on hover", () => {
  const css = readCssSource("src/styles.css");
  expect(css).not.toMatch(/\.pinned-banner-click-area:is\([^)]*:hover/);
  // Global button hover must not paint the pinned banner (regression after PR #294).
  expect(css).toMatch(
    /@media \(hover: hover\) and \(pointer: fine\) \{\s*button:hover:not\(:disabled\):where\(:not\(\.pinned-banner-click-area\)\) \{/,
  );
  expect(css).toMatch(/\.pinned-banner-click-area:focus-visible\s*\{[^}]*background:\s*var\(--surface-hover\)/);
});

it("matches the pinned preview font and active chat header dimensions", () => {
  const css = readCssSource("src/styles.css");
  const preview = css.match(/\.pinned-banner-preview\s*\{([^}]*)\}/)?.[1] ?? "";
  const bannerRules = [...css.matchAll(/\.messenger-shell\.has-active-chat \.pinned-banner\s*\{([^}]*)\}/g)];
  const banner = bannerRules.at(-1)?.[1] ?? "";
  expect(preview).toMatch(/font-size:\s*calc\(var\(--font-size-body\) \* var\(--message-scale\)\)/);
  expect(preview).toMatch(/font-weight:\s*var\(--font-weight-regular\)/);
  expect(banner).toMatch(/height:\s*var\(--chat-floating-header-height\)/);
  expect(banner).toMatch(/max-height:\s*var\(--chat-floating-header-height\)/);
  expect(banner).toMatch(/min-height:\s*var\(--chat-floating-header-height\)/);
  expect(banner).toMatch(/margin-inline:\s*var\(--active-chat-message-inset-x\)/);
});
