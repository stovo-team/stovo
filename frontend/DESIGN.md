---
name: Family Messenger Frontend
product: Private Messenger
version: 1
design-principles:
  - calm
  - private
  - approachable
  - practical
  - themeable
typography:
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  lineHeight: 1.5
  headings:
    h1:
      fontSize: 24px
      fontWeight: 700
      lineHeight: 1.2
    h2:
      fontSize: 18px
      fontWeight: 700
      lineHeight: 1.25
  body:
    md:
      fontSize: 16px
      fontWeight: 400
    sm:
      fontSize: 14px
      fontWeight: 500
  label:
    fontSize: 12px
    fontWeight: 800
    textTransform: uppercase
radius:
  control: 8px
  card: 8px
  bubble-rounded: 18px
  bubble-soft: 12px
  bubble-square: 6px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
layout:
  pageMaxWidth: 1120px
  storageMaxWidth: 1320px
  desktopNavRail: 88px
  chatSidebar:
    min: 300px
    max: 360px
  chatDetailsPanel:
    min: 292px
    max: 340px
  controlMinHeight: 40px
  inputMinHeight: 42px
  iconButtonSize: 42px
shadows:
  surface: "0 18px 44px rgba(15, 23, 42, 0.1)"
  menu: "0 18px 42px rgba(15, 23, 42, 0.16)"
  lightbox: "0 24px 60px rgba(15, 23, 42, 0.4)"
themes:
  light:
    colors:
      background-primary: "#ffffff"
      background-secondary: "#f6f7f9"
      background-tertiary: "#eef1f5"
      background-panel-accent: "#edf2f7"
      surface-card: "#ffffff"
      text-primary: "#111827"
      text-secondary: "#6b7280"
      text-muted: "#9ca3af"
      border-default: "#e5e7eb"
      accent-primary: "#2aabee"
      accent-primary-hover: "#168ac0"
      accent-soft: "#e6f5fc"
      accent-border-soft: "#bfdbfe"
      focus-ring: "rgba(42, 171, 238, 0.32)"
      focus-shadow: "rgba(42, 171, 238, 0.16)"
      outline-soft: "rgba(42, 171, 238, 0.12)"
      danger: "#ef4444"
      success: "#22c55e"
      warning: "#f59e0b"
      chat-layout-background: "#d9e7ef"
      message-bubble-bg: "#ffffff"
      message-bubble-border: "rgba(229, 231, 235, 0.82)"
      message-bubble-mine-bg: "#dff2fb"
      message-bubble-mine-border: "#b8e4f7"
  dark:
    colors:
      background-primary: "#0f172a"
      background-secondary: "#111827"
      background-tertiary: "#1f2937"
      background-panel-accent: "#182235"
      surface-card: "#182235"
      text-primary: "#f9fafb"
      text-secondary: "#cbd5e1"
      text-muted: "#94a3b8"
      border-default: "#334155"
      accent-primary: "#60a5fa"
      accent-primary-hover: "#93c5fd"
      accent-soft: "#1e3a5f"
      accent-border-soft: "#3b82f6"
      focus-ring: "rgba(96, 165, 250, 0.35)"
      focus-shadow: "rgba(96, 165, 250, 0.24)"
      outline-soft: "rgba(96, 165, 250, 0.18)"
      chat-layout-background: "#0f172a"
      message-bubble-bg: "#182235"
      message-bubble-border: "#334155"
      message-bubble-mine-bg: "#15324e"
      message-bubble-mine-border: "#285d8a"
  amoled:
    colors:
      background-primary: "#000000"
      background-secondary: "#02040a"
      background-tertiary: "#0b1120"
      background-panel-accent: "#05070c"
      surface-card: "#05070c"
      text-primary: "#f8fafc"
      text-secondary: "#cbd5e1"
      text-muted: "#94a3b8"
      border-default: "#1f2937"
      accent-primary: "#60a5fa"
      accent-primary-hover: "#93c5fd"
      accent-soft: "#1e3a5f"
      accent-border-soft: "#3b82f6"
      chat-layout-background: "#000000"
      message-bubble-bg: "#0b1120"
      message-bubble-border: "#1f2937"
accent-options:
  blue:
    light: "#2aabee"
    dark: "#60a5fa"
  green:
    light: "#15946f"
    dark: "#34d399"
  purple:
    light: "#8b5cf6"
    dark: "#a78bfa"
  rose:
    light: "#e11d48"
    dark: "#fb7185"
  amber:
    light: "#d97706"
    dark: "#fbbf24"
defaults:
  themeMode: system
  accent: blue
  wallpaper: dots
  density: comfortable
  bubbleShape: rounded
  messageScale: 1
  avatarColor: "#0ea5e9"
---

# Design System

## Overview
Family Messenger should feel private, calm, and trustworthy first, then friendly and modern second. The UI is intentionally cleaner than a social app and warmer than a corporate admin tool: soft surfaces, restrained color, rounded controls, strong legibility, and very little decorative noise outside the messaging canvas.

The dominant pattern is a practical messaging workspace: stable panels, sticky headers, card-based settings, and small, purposeful accents. Every new screen should feel like it belongs to the same product family as chats, storage, settings, and admin rather than looking like a standalone mini-app.

## Visual Language
- Use a quiet neutral base and let accent color do the highlighting. The interface should never become rainbow-heavy or gradient-led.
- Keep surfaces flat-to-soft. Depth comes from contrast, borders, and occasional shadow, not heavy elevation stacks.
- Favor rounded geometry. Controls are 8px, cards are 8px, pills are fully rounded, and message bubbles are more rounded than the rest of the UI.
- Use iconography to support scanning, not to decorate. The current visual language uses `lucide-react`; new icons should stay in that family.
- Chat views may use subtle texture or wallpaper. Non-chat screens should stay cleaner and mostly panel/card based.

## Theme Model
The product is personalized by runtime appearance settings. Any new UI must inherit and respect the existing theme system instead of hard-coding one-off colors.

- Theme modes: `light`, `dark`, `amoled`, plus `system` as the default resolver.
- Accent choices: `blue`, `green`, `purple`, `rose`, `amber`, and `custom`.
- Density: `comfortable` and `compact`.
- Wallpaper: `dots`, `paper`, `aurora`, `plain`.
- Bubble shape: `rounded`, `soft`, `square`.
- Message scale and avatar color are user-adjustable.

When adding components, prefer existing CSS variables such as `--surface-card`, `--background-secondary`, `--text-primary`, `--text-secondary`, `--border-default`, `--accent-primary`, `--accent-soft`, and `--accent-border-soft`. New components should look correct in all three resolved themes without requiring per-screen overrides.

## Color Guidance
### Core neutrals
- `background-primary` and `surface-card` define the main canvas and cards.
- `background-secondary` is the default panel/page fill.
- `background-tertiary` is for quieter containers, icon chips, and previews.
- `border-default` should be the default divider and outline color.

### Accent usage
- `accent-primary` is reserved for primary actions, active markers, unread emphasis, and selected states.
- `accent-soft` is the preferred hover/active background for low-emphasis interactive UI.
- `accent-border-soft` is used with `accent-soft` when a selected control needs more shape definition.
- `accent-primary-hover` is primarily a text/icon color on tinted accent backgrounds.

### Semantic colors
- Use red for destructive states, failures, unread urgency, and critical badges.
- Use green for positive confirmation and healthy states.
- Use amber/yellow for warnings, offline states, and non-fatal caution.

### Messaging-specific color rules
- Incoming message bubbles are neutral surfaces.
- Outgoing bubbles use a tinted accent-family background, never a fully saturated brand fill.
- Date separators, reaction pills, and search containers should be soft and unobtrusive so message content stays dominant.

## Typography
Use Inter everywhere. The type system is compact, readable, and biased toward scanning in dense communication views.

- `h1`: 24px, bold, used for top-level page titles.
- `h2`: 18px, bold, used for section titles and sub-panels.
- Body copy should generally stay around 14-16px.
- Labels and UI metadata use heavier weights than body copy. Small labels are often uppercase and bold for quick recognition.
- Secondary text should be quieter through color, not tiny sizing.

Avoid oversized marketing typography. This is a utility product, not a landing page.

## Spacing And Layout
Spacing should feel tidy and regular, mostly built from 8px/12px/16px/24px steps.

- Prefer 8px gaps inside small controls and pill groups.
- Prefer 12px-16px inside cards, forms, menus, and compact sections.
- Prefer 18px-24px between major page regions.
- Desktop app views are structured and panel-based.
- Mobile should collapse gracefully rather than trying to preserve desktop density.

### Layout patterns
- Main app shell: navigation rail on desktop, bottom nav on smaller screens.
- Standard content pages: centered page surface with generous padding.
- Chats: left sidebar + active conversation + optional details panel.
- Storage: content-first layout with a supportive sticky details panel on desktop.
- Modals: centered, card-like, medium width, no fullscreen takeover unless the viewport forces it.

## Surfaces And Shape
- Standard controls and cards use `8px` radii.
- Use pill shapes for search, chips, composer fields, attachment pills, and send actions.
- Message bubbles are the most expressive shape in the product and can vary with user preference.
- Empty states and low-priority placeholders may use dashed borders for softer visual weight.

Shadows should be used sparingly:
- auth panels, floating menus, modals, and lightboxes may use pronounced but soft shadows
- ordinary cards generally rely on borders and contrast instead of stacked elevation

## Component Patterns
### Buttons
- Default buttons are neutral cards with border and strong label weight.
- Primary submit actions use solid `accent-primary` fill with white text.
- Hover states usually shift to `accent-soft` rather than scaling, glowing, or introducing dramatic motion.
- Icon buttons are circular and should stay visually balanced at 42x42.
- Destructive buttons use soft red fills and dark red text, not loud saturated red backgrounds.

### Inputs
- Inputs and selects are full-width by default, 42px tall, and framed by a 1px border.
- Focus treatment is important: visible outline plus soft shadow using theme-aware accent tokens.
- Search fields are pill-shaped and usually sit on `background-secondary`.
- Do not introduce underline-only or borderless text fields in standard app surfaces.

### Navigation
- Navigation uses icons plus compact labels.
- Active nav items receive soft accent background and accent-colored foreground.
- Unread counts are small red circular badges.
- Desktop rail should feel compact and vertical; mobile nav should feel touch-friendly and fixed.

### Lists
- Use comfortable, clearly tappable rows.
- Selected rows should rely on tinted backgrounds and subtle left-edge accent indicators, not heavy fills.
- Metadata should truncate cleanly and never push layout off balance.

### Cards And Panels
- Cards are bordered, lightly elevated or flat, and use consistent padding.
- Settings, admin, storage detail, and auth experiences all derive from the same panel language.
- Panels should read as structured tools, not glossy marketing blocks.

### Chips, Tabs, And Segmented Controls
- Filter chips and tabs use low-emphasis neutral backgrounds by default.
- Active states switch to `accent-soft` with an accent-tinted border.
- Keep them compact, pill-like, and horizontally scannable.

### Alerts And Banners
- Success, error, and offline notices should be short, high-contrast, and banner-like.
- Floating alerts are acceptable for transient messaging, especially inside the chat workspace.
- Never hide critical status in color alone; pair with icon or text.

### Empty States
- Empty states should be centered, concise, and action-oriented.
- Use one icon, one short title, one sentence, and optionally one clear next action.
- Keep empty-state tone warm and practical, never jokey or overly promotional.

### Modals And Menus
- Menus are compact, bordered floating cards with tight padding.
- Modal dialogs are medium-width panels with a clear title row and one obvious primary action.
- Close actions should be available both visually and via Escape/backdrop patterns where appropriate.

### Messaging Components
- Message bubbles should preserve a clean reading rhythm and avoid visual clutter.
- Sender names appear only when useful, typically on incoming messages.
- Metadata belongs at the bottom-right and stays secondary.
- Reply and forward references use a slim accent rule rather than a full blockquote treatment.
- Reactions are pill-shaped and should stay compact even when counts grow.
- The composer is a pill-forward control bar: attachment, emoji, text input, send.

### Media And Files
- Attachment cards should feel like small utility tiles, not social-media cards.
- Image previews may become edge-to-edge within their own card.
- Storage tiles can use richer color coding by content type, but the palette should still feel muted and system-driven.
- Fullscreen/lightbox experiences may become darker and more cinematic than the rest of the UI, but only for media focus moments.

## Page Patterns
### Auth And Setup
- Use a centered glassy card/panel over a calm background.
- Keep the content narrow and reassuring.
- Prioritize clarity over density.

### Chats
- This is the primary product experience and should set the tone for all new UI.
- The sidebar should feel quick to scan.
- The active conversation should feel roomy, calm, and content-first.
- Details panels should reuse the same card/section primitives as settings.

### Settings
- Settings are grouped as simple lists of actionable rows.
- When a detail panel opens, it should feel like a continuation of the same page, not a brand-new route concept.
- Appearance controls are one of the most expressive parts of the app, so previews are encouraged there.

### Storage
- Storage is more visual than the rest of the product but should still feel organized and utility-first.
- Use a clear distinction between grid browsing and file detail inspection.
- Preview areas can be larger, but metadata remains structured and quiet.

### Admin
- Admin should stay aligned with the main design system, not switch to a separate enterprise style.
- It can become denser and more tabular, but should still use the same cards, borders, badges, and typography.

## Motion And Interaction
- Motion should be subtle and fast. Existing UI uses short transitions around 140-160ms.
- Prefer color, border, and shadow changes over dramatic transforms.
- Small press feedback like `translateY(1px)` is acceptable for buttons.
- Avoid springy, bouncy, or oversized animation unless the interaction is explicitly playful, which this product generally is not.

## Accessibility And Readability
- Maintain strong text contrast in every theme, especially dark and AMOLED.
- Focus states must remain visible and theme-aware.
- Touch targets should stay around 40px-44px minimum for primary interactive elements.
- Support keyboard interaction for menus, dialogs, inputs, and close actions.
- Do not rely on wallpaper or accent tint behind small text.

## Do
- Do build new UI from existing tokens and CSS variables first.
- Do keep the interface calm, readable, and card-based.
- Do use accent color to signal importance, active state, and interactivity.
- Do design every new screen for light, dark, and AMOLED.
- Do preserve consistent rounded geometry and compact utility-focused typography.
- Do make empty and loading states feel intentional.

## Don't
- Don't introduce unrelated brand colors or gradient-heavy hero treatments.
- Don't create a new visual language for admin, settings, or storage.
- Don't use saturated fills for every action; save strong color for priority actions.
- Don't mix sharp-cornered components into otherwise rounded views.
- Don't add decorative shadows to every surface.
- Don't hard-code colors that ignore the runtime appearance system.

## Guidance For Agents
When generating new frontend screens or components:

- start from the existing theme variables instead of new raw color constants
- default to card, panel, list-row, chip, and pill patterns already present in the app
- use Lucide icons where icons are needed
- ensure new screens collapse well below `960px` and again below `680px`
- prefer practical family-oriented copy over abstract product jargon
- if a component could belong inside chats, settings, storage, or admin, make it feel like a sibling of those screens rather than a new brand direction
