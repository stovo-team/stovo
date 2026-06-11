---
name: Stovo Family Messenger
product: Private family messenger (Capacitor Android + web)
version: 2
iconLibrary:
  messenger: Material Symbols Outlined
  secondary: lucide-react
stitch:
  status: draft-input
  targetTool: Google Stitch
  handoff: "Polish mobile + desktop messenger shell; return Stitch exports to replace §Stitch Deliverables"
  referenceAesthetic: Telegram-inspired floating panels (not a clone)
design-principles:
  - calm
  - private
  - family-first
  - themeable
  - floating-over-wallpaper
breakpoints:
  mobile: "max-width 960px"
  compact: "max-width 680px"
  desktop: "min-width 961px"
  desktopWide: "min-width 1280px"
frames:
  mobile:
    width: 390
    height: 844
    safeArea: "respect env(safe-area-inset-*) on Capacitor Android"
  desktop:
    width: 1440
    height: 900
    minWidth: 1280
typography:
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  scale:
    label: { size: 12, weight: 400, lineHeight: 1.2 }
    labelBold: { size: 12, weight: 700, lineHeight: 1.2 }
    body: { size: 16, weight: 400, lineHeight: 1.5 }
    heading: { size: 18, weight: 700, lineHeight: 1.25 }
    display: { size: 24, weight: 700, lineHeight: 1.2 }
radius:
  control: 8px
  card: 8px
  floatPanel: 24px
  floatBubbleTail: "12px corners + 4px tail"
  pill: 999px
  composerMobile: 24px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
floatTokens:
  outerGapDesktop: "16px (24px at >=1280px)"
  outerGapMobile: 0px
  panelGapDesktop: 16px
  navPillInset: 16px
  navPillHeight: 64px
  messageGutter: 16px
  fabSizeMobile: 56px
  fabSizeDesktop: 52px
themes:
  light:
    canvas: "#d9e7ef"
    surface: "#ffffff"
    surfaceSecondary: "#f6f7f9"
    textPrimary: "#111827"
    textSecondary: "#6b7280"
    textMuted: "#9ca3af"
    border: "#e5e7eb"
    accent: "#2aabee"
    accentSoft: "#e6f5fc"
    bubbleIncoming: "#ffffff"
    bubbleOutgoing: "#2aabee"
    bubbleOutgoingText: "#ffffff"
    inputText: "#111827"
    inputPlaceholder: "#9ca3af"
    navPillSurface: "rgba(255,255,255,0.92)"
    navActiveFill: "#e6f5fc"
    navActiveIcon: "#168ac0"
  dark:
    canvas: "#0f172a"
    surface: "#182235"
    surfaceSecondary: "#111827"
    textPrimary: "#f9fafb"
    textSecondary: "#cbd5e1"
    textMuted: "#94a3b8"
    border: "#334155"
    accent: "#60a5fa"
    accentSoft: "#1e3a5f"
    bubbleIncoming: "#212121"
    bubbleOutgoing: "#766ac8"
    bubbleOutgoingText: "#ffffff"
    inputText: "#f9fafb"
    inputPlaceholder: "#94a3b8"
    navPillSurface: "rgba(24,34,53,0.92)"
    navActiveFill: "subtle — see Mobile §Bottom Nav"
    navActiveIcon: "#60a5fa"
  amoled:
    canvas: "#000000"
    surface: "#05070c"
    surfaceSecondary: "#02040a"
    textPrimary: "#f8fafc"
    textSecondary: "#cbd5e1"
    textMuted: "#94a3b8"
    border: "#1f2937"
    accent: "#60a5fa"
    accentSoft: "#1e3a5f"
    bubbleIncoming: "#212121"
    bubbleOutgoing: "#766ac8"
    bubbleOutgoingText: "#ffffff"
    inputText: "#f8fafc"
    inputPlaceholder: "#94a3b8"
    navPillSurface: "rgba(5,7,12,0.92)"
    navActiveFill: "subtle — see Mobile §Bottom Nav"
    navActiveIcon: "#60a5fa"
accentOptions:
  blue: { light: "#2aabee", dark: "#60a5fa" }
  green: { light: "#15946f", dark: "#34d399" }
  purple: { light: "#8b5cf6", dark: "#a78bfa" }
  rose: { light: "#e11d48", dark: "#fb7185" }
  amber: { light: "#d97706", dark: "#fbbf24" }
defaults:
  themeMode: system
  accent: blue
  wallpaper: dots
  density: comfortable
---

# Stovo Design System — Stitch Handoff

> **Purpose:** Input brief for [Google Stitch](https://stitch.withgoogle.com) polish pass. Phase 5 implemented a **raw** Telegram-inspired floating shell. This document splits **mobile** and **desktop** targets, lists known defects from device review, and defines what polished Stitch exports must deliver.

---

## Stitch workflow

### What to design in Stitch

| Priority | Screen | Platform | Stitch frame |
|----------|--------|----------|--------------|
| P0 | Chat list | Mobile | 390×844 |
| P0 | Active DM conversation | Mobile | 390×844 |
| P0 | Chat list + conversation | Desktop | 1440×900 |
| P1 | Group chat (sender labels) | Mobile | 390×844 |
| P1 | Settings → Appearance preview | Mobile + Desktop | both |
| P2 | Storage, Contacts, Auth | Desktop | 1440×900 |

### Stitch deliverables (return to repo)

When polished designs are ready, add under `frontend/design/stitch/`:

```
frontend/design/stitch/
  mobile/
    chat-list.png (or .fig export)
    chat-conversation.png
    nav-states.png          # default + active tab close-up
    composer-states.png     # empty + typing
  desktop/
    messenger-workspace.png
    chat-list-sidebar.png
    chat-detail.png
  tokens.json               # optional: extracted colors/spacing from Stitch
  NOTES.md                  # deltas from this DESIGN.md
```

Implementation agent maps Stitch output → `styles.css` + component class tweaks. **Do not** replace the appearance settings system or backend.

### Design references (mood, not copy)

- Telegram floating panels, inset mobile nav pill, tail message bubbles
- Stovo brand: calm, family-private, purple/blue accent (user-selectable)
- Existing sketches: `.planning/sketches/001-desktop-floating-shell/`, `002-mobile-floating-chrome/`, `003-message-surfaces/`

---

## Known defects (v1 implementation — fix in polish)

These were found on Android after `npm run build && npx cap sync android`. **Stitch designs must explicitly solve each.**

| ID | Issue | Expected behavior |
|----|-------|-------------------|
| **D-01** | Layout does not fit screen | All messenger chrome fits within **100dvh**; no horizontal scroll; safe-area insets respected; FAB + nav + composer never clip content |
| **D-02** | Input text black on dark/amoled | Typed text in **search**, **composer textarea**, and **settings inputs** must use `inputText` token (`#f9fafb` dark, `#f8fafc` amoled). Placeholder uses `inputPlaceholder`. |
| **D-03** | Mobile nav active fill harsh | Active tab indicator should feel **Telegram-native**: small rounded pill behind icon+label OR icon tint only — **not** a heavy full-width `--accent-soft` block. See Mobile §Bottom Nav. |
| **D-04** | Overall polish raw | Spacing rhythm, shadow strength, wallpaper visibility, and touch targets need a cohesive pass — current CSS is structural only |

### CSS hooks (implementation)

| Component | Class / file |
|-----------|----------------|
| App shell | `.app-frame`, `.messenger-workspace`, `.messenger-shell` |
| Desktop nav rail | `.app-frame > .app-nav` |
| Mobile nav pill | `@media (max-width: 960px) .app-frame > .app-nav` |
| Active nav | `.app-nav a.active` |
| Search | `.search-field`, `.search-field input` |
| Composer | `.message-composer`, `.message-composer textarea` |
| Bubbles | `.message-bubble`, `.message-bubble.mine`, `.message-bubble-inner` |
| FAB | `.compose-fab` |
| Icons | `frontend/src/components/icons/*` |

---

## Shared foundations

### Theme model

Runtime via `AppearanceContext` → `document.documentElement` attributes:

- `data-theme-mode`: `light` | `dark` | `amoled`
- `data-accent`: `blue` | `green` | `purple` | `rose` | `amber` | `custom`
- `data-wallpaper`, `data-density`, `data-bubble-shape`

**Rule:** No hard-coded `#fff` / `#000` in components except white icons on solid accent buttons.

### Iconography

- **Messenger chrome:** **Material Symbols Outlined** (Google Fonts) via `.ms-icon` ligatures; `FILL=1` on active nav routes
- **Admin / calls / secondary:** lucide-react (unchanged)
- **Legacy:** custom SVG components remain in `frontend/src/components/icons/` for reference; messenger chrome migrated in Phase 6

### CSS variable map (input tokens — D-02)

| DESIGN.md token | CSS variable |
|-----------------|--------------|
| `inputText` | `--input-text` |
| `inputPlaceholder` | `--input-placeholder` |

### Implemented design variants (Phase 6 defaults)

| Area | Default | Notes |
|------|---------|-------|
| Mobile nav active | **Variant A** — centered 40×48px pill | Class `app-nav--active-variant-a` |
| Desktop composer | **Variant A** — flat bar | Border-top at panel bottom |
| Mobile composer | **Variant B** — inset pill | Floating margin + soft shadow |
| Panel elevation | **Variant A** — deep float | `0 20px 40px rgba(0,0,0,0.4)` |
| Wallpaper | **Variant A** — 20px dot grid | On `#0f172a` canvas |
| Selected chat row | **Hybrid** | `border-left: 2px` accent + 14% tint |

### Motion defaults (Phase 6)

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Color / background / border | 150ms | ease-out |
| Transform (chip press, FAB) | 200ms | ease-out |
| Nav active pill | 150ms | ease-out |
| Theme switch (body) | 160ms | ease |

`prefers-reduced-motion: reduce` collapses messenger transitions to `0.01ms`. No animation on bubble entrance, wallpaper, or panel shadow on scroll.

**Outgoing bubble on dark/amoled:** `#766ac8` (violet) is intentional — distinct from accent blue (`#60a5fa`).

### Chat list structure (do not remove)

1. **Filter chips:** All · Unread · Groups · Direct · Muted (horizontal scroll, pill shape)
2. **Sections:** Channels → Groups → DMs (uppercase 12px labels)
3. **No** security/login promo banners in chat list

### Message bubbles (Telegram tail)

| Property | Value |
|----------|-------|
| Incoming radius | `12px 12px 12px 4px` |
| Outgoing radius | `12px 12px 4px 12px` |
| Grouped stack | 2px vertical gap; inner corners flatten to 4px |
| Incoming fill | `bubbleIncoming` per theme |
| Outgoing fill | solid `accent` / violet `#766ac8` dark — **not** soft tint |
| Border / shadow | none on bubbles |
| Timestamp | 11px inline bottom-right inside bubble, 55–70% opacity |
| Max width | 88% mobile, 72% desktop |

---

## Mobile design spec

**Frame:** 390×844 (iPhone 14 logical). **Breakpoint:** ≤960px. **Primary device:** Capacitor Android.

### Layout stack (bottom → top)

```
┌─────────────────────────────┐
│ Wallpaper canvas (full)      │
│  ┌─────────────────────────┐ │
│  │ Chat list OR conversation│ │
│  │ (100dvh minus chrome)    │ │
│  └─────────────────────────┘ │
│                    [FAB]     │  ← compose, above nav
│  ┌─────────────────────────┐ │
│  │  ○ Chats  ○ Files  ...   │ │  ← floating nav pill (inset)
│  └─────────────────────────┘ │
└─────────────────────────────┘
```

### Viewport & safe area (**D-01**)

| Token | Target |
|-------|--------|
| Workspace height | `100dvh` (not `100vh` alone) |
| Horizontal overflow | `hidden` on messenger shell |
| Bottom padding | `nav inset + nav height + FAB stack + composer margin + safe-area-inset-bottom` |
| Top | respect `safe-area-inset-top` for status bar |

**Stitch must show:** chat list and conversation with **no content hidden** behind FAB or nav pill.

### Screen: Chat list

| Element | Spec |
|---------|------|
| Header | App title or family name, minimal |
| Search | Full-width pill, 44px height, icon + placeholder "Search chats" |
| Filter chips | 32px height pills, 8px gap, horizontal scroll |
| Section headers | CHANNELS / GROUPS / DMS — 12px bold uppercase, muted |
| Row height | 72px min, 52px avatar, 16px name, 12px preview |
| Selected row | full-row tint `--accentSoft` at **~12–16% opacity** (refine in Stitch) |
| Unread badge | accent or red circle, top-right of row meta |

### Screen: Conversation

| Element | Spec |
|---------|------|
| Header | Back, avatar, name, call/menu icons (42px touch) |
| Messages | `--messageGutter` 16px horizontal; wallpaper visible in gutters |
| Date pill | centered, 12px bold, semi-transparent |
| Composer | Floating pill: margin 0 16px 8px, radius 24px, border + soft shadow |
| Composer input | **D-02:** typed text = `inputText`; placeholder = `inputPlaceholder` |
| Composer actions | attach, emoji, send (accent fill) |

### Bottom nav pill (**D-03** — redesign target)

**Current (bad):** full tab cell filled with `--accent-soft` — reads heavy and blocky.

**Target (Stitch):**

| State | Background | Icon | Label |
|-------|------------|------|-------|
| Default | transparent | `textMuted` | `textMuted`, 10px bold |
| Active | **Option A:** 40×56px rounded pill centered in tab slot, `accentSoft` at 20% | `accent` | `accent` |
| Active | **Option B:** no fill; icon + label `accent` only | `accent` | `accent` |
| Active | **Option C:** 2px accent top indicator + subtle 8% fill | `accent` | `accent` |

**Nav pill container:**

| Property | Value |
|----------|-------|
| Position | fixed, inset 16px from left/right/bottom |
| Height | 64px |
| Radius | 999px |
| Surface | `navPillSurface` + 1px `border` |
| Shadow | `--float-shadow` |
| Items | Chats, Storage, Contacts, Settings (icons 22px + label) |

**FAB:**

| Property | Value |
|----------|-------|
| Size | 56px circle |
| Position | fixed, right 20px, bottom = above nav pill + 16px gap |
| Fill | solid `accent` |
| Icon | white compose (+) |

### Mobile states to export from Stitch

1. Chat list — dark + amoled
2. Conversation with bubbles — dark
3. Nav pill — 4 tabs, one active (close-up)
4. Composer focused — keyboard up (optional frame)

---

## Desktop design spec

**Frame:** 1440×900. **Breakpoint:** ≥961px. **Wide:** ≥1280px increases outer gap to 24px.

### Layout (floating workspace)

```
┌──────────────────────────────────────────────────────────┐
│ wallpaper (dots / user preference)                        │
│  ┌──┐ ┌──────────┐ ┌─────────────────────────────────┐   │
│  │N │ │ Sidebar  │ │ Chat detail                      │   │
│  │a │ │ 340px    │ │ (flex)                           │   │
│  │v │ │ + FAB    │ │                                  │   │
│  │  │ └──────────┘ └─────────────────────────────────┘   │
│  └──┘                                                     │
│  16–24px outer gap all sides                              │
└──────────────────────────────────────────────────────────┘
```

### Nav rail

| Property | Value |
|----------|-------|
| Width | 72–88px |
| Shape | floating card, radius 20px, shadow |
| Items | icon 22px + 10px label, stacked |
| Active | `accentSoft` background on item (acceptable on desktop; lighter than mobile) |
| Logout | bottom of rail |

### Chat sidebar panel

| Property | Value |
|----------|-------|
| Width | min 300px, max 360px |
| Shape | floating card, radius 20px, shadow — **no** flush border to chat |
| Search + chips | same as mobile |
| Sections | Channels / Groups / DMs |
| FAB | 52px, **inside** sidebar bottom-right (not viewport-fixed) |

### Chat detail panel

| Property | Value |
|----------|-------|
| Shape | floating card, radius 20px, shadow |
| Header | sticky, 56–64px |
| Messages | internal scroll; tail bubbles per shared spec |
| Composer | full-width bottom of panel (desktop may use flat bar OR subtle pill — Stitch to decide) |

### Desktop states to export from Stitch

1. Full workspace — dark theme, conversation open
2. Sidebar only — no chat selected (empty state)
3. Three-panel with details open (optional)
4. Light theme comparison strip

---

## Component token map (Stitch → CSS)

Use this table when exporting from Stitch. Map names to `frontend/src/styles.css` variables.

| Stitch token | CSS variable | Notes |
|--------------|--------------|-------|
| canvas | `--chat-layout-background` | + wallpaper pattern |
| surface | `--surface-card` | panels, composer |
| surfaceSecondary | `--background-secondary` | search, textarea bg |
| textPrimary | `--text-primary` | body, input text **D-02** |
| textMuted | `--text-muted` | placeholders |
| accent | `--accent-primary` | FAB, send, outgoing bubble |
| accentSoft | `--accent-soft` | chips, selected row (tune opacity) |
| border | `--border-default` | |
| floatShadow | `--float-shadow` | |
| outerGap | `--float-outer-gap` | |
| panelRadius | `--float-radius-panel` | 24px |
| messageGutter | `--message-gutter-x` | 16px |

### Input contract (**D-02**)

| Field | Text color | Placeholder | Background |
|-------|------------|-------------|--------------|
| Search | `textPrimary` | `textMuted` | `surfaceSecondary` |
| Composer | `textPrimary` | `textMuted` | `surfaceSecondary` inside pill |
| Settings | `textPrimary` | `textMuted` | `surface` |

**Acceptance:** Screenshot dark + amoled with typed message "Hello" — text must be white/off-white, not black.

---

## Out of scope (v2 polish)

- Admin / storage page redesign (keep existing card system)
- iOS-specific chrome
- Login/security alert cards in chat list
- Animated Telegram doodle wallpaper
- New backend APIs

---

## Legacy guidance (non-messenger pages)

Settings, storage, admin, and auth continue using the **card + 8px radius** system from v1. Only the **messenger shell** (`ChatsPage`, `AppNav` on mobile/desktop) uses the floating Telegram paradigm above.

### Do

- Design mobile and desktop as **separate Stitch frames**, not one responsive comp
- Specify dark **and** amoled for messenger chrome
- Show active nav state as a **dedicated close-up** (D-03)
- Keep Channels / Groups / DMs structure visible in chat list frames

### Don't

- Flatten chat list into a single undifferentiated list
- Use card-style bordered message bubbles (tails only)
- Use soft tint for outgoing bubbles on dark themes
- Hard-code colors that bypass theme tokens

---

*Document version: 2.1 — Stitch input + Phase 6 implementation sync. Last updated: 2026-06-11. Messenger polish implemented; Stitch exports optional.*
