---
name: Stovo Family Messenger
product: Private family messenger (Capacitor Android + web)
version: 4
iconLibrary:
  messenger: Material Symbols Outlined
  secondary: lucide-react
stitch:
  status: v2-floating-islands-handoff
  targetTool: Google Stitch
  handoff: "Phase 7 Stitch V2 floating islands + Phase 8 appearance personalization restored (see 07-UI-SPEC.md, 08-UI-SPEC.md)"
  referenceAesthetic: Telegram-inspired floating panels (not a clone)
design-principles:
  - calm
  - private
  - family-first
  - themeable
  - floating-islands-on-black
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
  outerGapMobile: 16px
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
    canvas: "#000000"
    surface: "#1c1c1e"
    surfaceSecondary: "#2c2c2e"
    textPrimary: "#ffffff"
    textSecondary: "#cbd5e1"
    textMuted: "#8e8e93"
    border: "#334155"
    accent: "var(--accent-primary) — user-selectable via data-accent"
    accentSoft: "var(--accent-soft)"
    bubbleIncoming: "#2c2c2e"
    bubbleOutgoing: "var(--accent-primary)"
    bubbleOutgoingText: "#ffffff"
    inputText: "#ffffff"
    inputPlaceholder: "#8e8e93"
    navPillSurface: "#1c1c1e"
    navActiveFill: "subtle — see Mobile §Bottom Nav"
    navActiveIcon: "var(--stovo-primary)"
  amoled:
    canvas: "#000000"
    surface: "#1c1c1e"
    surfaceSecondary: "#2c2c2e"
    textPrimary: "#ffffff"
    textSecondary: "#cbd5e1"
    textMuted: "#8e8e93"
    border: "#1f2937"
    accent: "var(--accent-primary) — user-selectable via data-accent"
    accentSoft: "var(--accent-soft)"
    bubbleIncoming: "#2c2c2e"
    bubbleOutgoing: "var(--accent-primary)"
    bubbleOutgoingText: "#ffffff"
    inputText: "#ffffff"
    inputPlaceholder: "#8e8e93"
    navPillSurface: "#1c1c1e"
    navActiveFill: "subtle — see Mobile §Bottom Nav"
    navActiveIcon: "var(--stovo-primary)"
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

# Stovo Design System — Stitch V2 + Appearance Personalization

> **Purpose:** Design contract for the Phase 7 **V2 floating islands** messenger shell and Phase 8 **appearance personalization** restore. Stitch reference frames remain authoritative for island geometry. Accent, wallpaper, and settings editor contracts live in `.planning/phases/08-appearance-customization-rework-fix-accent-wallpaper-overrid/08-UI-SPEC.md`.

> **Supersession:** Phase 7 UI-SPEC defines messenger **layout**; Phase 8 restores user-controlled **accent and wallpaper** (no locked `#6750A4`). Phase 6 **motion contract** (150ms/200ms transitions, `prefers-reduced-motion`) is retained.

---

## V2 Floating Islands

Three Stitch reference frames define the messenger chrome. Full geometry tables live in `07-UI-SPEC.md` §Stitch Frame Specs — this section summarizes acceptance targets only.

| Frame | Viewport | Key chrome |
|-------|----------|------------|
| **Frame 1 — Mobile chat list** | 390×884 | Plain `#000000` canvas; floating top card (brand + search + filter chips); purple FAB only (no header compose); opaque bottom nav pill; last list row clears FAB + nav |
| **Frame 2 — Mobile conversation** | 390×884 | No bottom nav; floating header pill + floating composer pill; grey `Message` placeholder (`#8e8e93`); typed text white (`#ffffff`); 44×44 circular icon-only send |
| **Frame 3 — Desktop workspace** | 1440×900 | Three separate islands (nav rail · sidebar · chat detail) with 16–24px black gutters; plain black canvas; circular send at all widths |

**Primary accent (messenger):** User-selected via `AppearanceContext` → `data-accent` on `:root`. `--stovo-primary` and `--bubble-outgoing` alias `var(--accent-primary)`. Studio preset uses purple; `#6750A4` is not a global lock.

**Accent cascade:** `:root[data-accent="…"]` sets light/dark token maps; `:root[data-theme-mode]` delegates resolved `--accent-primary` (dark/amoled use `var(--accent-primary-dark)`).

**Island surfaces:** `#1c1c1e` panels, `#2c2c2e` raised (search field, composer textarea).

**Canvas:** `#000000` AMOLED on messenger shell (L0). Message gutters (`.messages-panel`) respect `data-wallpaper` from `AppearanceContext` — dots, paper, aurora, or plain on black.

**Conversation chrome (mobile ≤960px):** Bottom nav and FAB hidden when `.has-active-chat`; FAB-only compose on `.chat-list-view`.

**Send button:** 44×44px circle, icon-only, all breakpoints — no visible "Send" text.

---

## Appearance Editor (Phase 8)

Settings → **Appearance** opens a drill-down editor (not an inline detail panel).

| Element | Contract |
|---------|----------|
| Navigation | Back chevron returns to settings list; profile/groups hidden while editor open |
| Preview hero | Live mini-thread (incoming + outgoing bubbles) updates on every `updateAppearance` call |
| Quick looks | Horizontal preset cards: Fresh, Forest, Studio, Warm |
| Theme | 4-segment control: System, Light, Dark, AMOLED |
| Accent | Swatch row + custom color input |
| Chat background | Visual tiles (Dots, Paper, Aurora, Plain) — no `<select>` |
| Bubbles | Chip row: Rounded, Soft, Square |
| Reset | Confirmation modal before restoring `DEFAULT_APPEARANCE` |

Full component specs: `08-UI-SPEC.md`. Instant apply — no save button.

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
| Wallpaper | User-selectable on message gutters | L0 canvas `#000`; `.messages-panel` uses `data-wallpaper` from AppearanceContext |
| Selected chat row | **Hybrid** | `border-left: 2px` accent + 14% tint |

### Motion defaults (Phase 6)

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Color / background / border | 150ms | ease-out |
| Transform (chip press, FAB) | 200ms | ease-out |
| Nav active pill | 150ms | ease-out |
| Theme switch (body) | 160ms | ease |

`prefers-reduced-motion: reduce` collapses messenger transitions to `0.01ms`. No animation on bubble entrance, wallpaper, or panel shadow on scroll.

**Outgoing bubble on dark/amoled:** `var(--accent-primary)` — follows user accent choice.

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
| Outgoing fill | solid `var(--accent-primary)` — **not** soft tint |
| Border / shadow | none on bubbles |
| Timestamp | 11px inline bottom-right inside bubble, 55–70% opacity |
| Max width | 88% mobile, 72% desktop |

---

## Mobile design spec

**Frame:** 390×844 (iPhone 14 logical). **Breakpoint:** ≤960px. **Primary device:** Capacitor Android.

### Layout stack (bottom → top)

```
┌─────────────────────────────┐
│ Plain black canvas (full)    │
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

### Conversation chrome (mobile ≤960px)

| View | Bottom nav | FAB | Top chrome |
|------|------------|-----|------------|
| Chat list (`.chat-list-view`) | Visible | Visible (FAB only — no header compose) | Floating top card |
| Active chat (`.has-active-chat`) | **Hidden** | **Hidden** | Floating header pill + composer pill |

### Screen: Conversation

| Element | Spec |
|---------|------|
| Header | Back, avatar, name, call/menu icons (42px touch) |
| Messages | `--messageGutter` 16px horizontal; wallpaper visible in gutters |
| Date pill | centered, 12px bold, semi-transparent |
| Composer | Floating pill: margin 0 16px 8px, radius 24px, border + soft shadow |
| Composer input | **D-02:** typed text = `inputText`; placeholder = `inputPlaceholder` |
| Composer actions | attach, emoji, send (44×44 circle, icon-only, `var(--accent-primary)`) |

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
│ plain black canvas (#000000)                              │
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

**Acceptance:** Screenshot dark + amoled with typed message "Hello" — text must be `#ffffff`, placeholder `#8e8e93` grey "Message".

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

*Document version: 3 — Stitch V2 floating islands handoff. Last updated: 2026-06-11. Aligned with Phase 7 UI-SPEC; Capacitor Android UAT required before phase sign-off.*
