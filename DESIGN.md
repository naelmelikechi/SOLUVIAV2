---
version: alpha
name: SOLUVIA
description: Strategic control layer for French training organisations. Forest-green, flat-with-border, green-tinted neutrals.

colors:
  # Brand
  primary: '#16a34a'
  primary-light: '#22c55e'
  primary-dark: '#15803d'
  primary-50: '#f0f9f2'
  primary-100: '#dcf2e2'
  accent: '#059669'

  # Neutrals — green-tinted, never pure grey
  background: '#f5f7f5'
  background-dark: '#0f1a0f'
  surface: '#f8faf8'
  surface-alt: '#f0f5f0'
  muted: '#e8f0e8'
  muted-foreground: '#6b8a6b'
  border: '#d4e4d4'
  border-light: '#e8f0e8'
  foreground: '#1a2e1a'

  # Semantic (status badges, stages)
  success: '#16a34a'
  warning: '#d97706'
  danger: '#dc2626'
  info: '#2563eb'
  purple: '#7c3aed'
  gray: '#6b7280'

  # Dark-mode equivalents (exported for completeness)
  dark-background: '#0f1a0f'
  dark-surface: '#162016'
  dark-border: '#2a3e2a'
  dark-foreground: '#e2efe2'
  dark-primary: '#22c55e'

typography:
  page-title:
    fontFamily: system-ui
    fontSize: '20px'
    fontWeight: '600'
    lineHeight: 1.3
  section-header:
    fontFamily: system-ui
    fontSize: '14px'
    fontWeight: '600'
    lineHeight: 1.4
  eyebrow:
    fontFamily: system-ui
    fontSize: '11px'
    fontWeight: '600'
    lineHeight: 1.4
    letterSpacing: 0.05em
  body:
    fontFamily: system-ui
    fontSize: '14px'
    fontWeight: '400'
    lineHeight: 1.5
  body-sm:
    fontFamily: system-ui
    fontSize: '13px'
    fontWeight: '400'
    lineHeight: 1.5
  meta:
    fontFamily: system-ui
    fontSize: '12px'
    fontWeight: '400'
    lineHeight: 1.4
  numeric:
    fontFamily: system-ui
    fontSize: '14px'
    fontWeight: '500'
    lineHeight: 1.4
    fontFeature: tnum

rounded:
  xs: 6px
  sm: 8px
  md: 10px
  lg: 12px
  xl: 16px
  pill: 9999px

spacing:
  card: 24px
  card-compact: 16px
  section-gap: 24px
  row-gap: 8px
  row-gap-lg: 12px
  page-y: 24px

components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '#ffffff'
    rounded: '{rounded.md}'
    padding: '10px 16px'
    fontSize: '14px'
    fontWeight: '500'

  button-outline:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.foreground}'
    border: '1px solid {colors.border}'
    rounded: '{rounded.md}'
    padding: '8px 14px'

  card:
    backgroundColor: '{colors.surface}'
    border: '1px solid {colors.border}'
    rounded: '{rounded.md}'
    padding: '{spacing.card}'
    shadow: none

  card-interactive:
    backgroundColor: '{colors.surface}'
    border: '1px solid {colors.border}'
    rounded: '{rounded.md}'
    padding: '12px'
    hoverBorder: '1px solid {colors.primary-light}'
    hoverShadow: '0 1px 3px rgba(0,0,0,0.04)'

  input:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.foreground}'
    border: '1px solid {colors.border}'
    rounded: '{rounded.sm}'
    padding: '6px 12px'
    focusRing: '{colors.primary}'

  badge-success:
    backgroundColor: '#dcf2e2'
    textColor: '{colors.success}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
    fontSize: '11px'
    fontWeight: '500'

  badge-info:
    backgroundColor: '#dbeafe'
    textColor: '{colors.info}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
    fontSize: '11px'
    fontWeight: '500'

  badge-warning:
    backgroundColor: '#fef3c7'
    textColor: '{colors.warning}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
    fontSize: '11px'
    fontWeight: '500'

  badge-danger:
    backgroundColor: '#fee2e2'
    textColor: '{colors.danger}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
    fontSize: '11px'
    fontWeight: '500'

  badge-purple:
    backgroundColor: '#ede9fe'
    textColor: '{colors.purple}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
    fontSize: '11px'
    fontWeight: '500'

  badge-gray:
    backgroundColor: '#f3f4f6'
    textColor: '{colors.gray}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
    fontSize: '11px'
    fontWeight: '500'

  sidebar-item-active:
    backgroundColor: '#e8f5ec'
    textColor: '{colors.primary}'
    borderLeft: '3px solid {colors.primary}'
    fontWeight: '600'

  sheet-right:
    backgroundColor: '{colors.surface}'
    borderLeft: '1px solid {colors.border}'
    width: '800px'
---

# SOLUVIA — Design System

## Overview

SOLUVIA is the strategic control layer for French training organisations (organismes de formation). Used daily by chefs de projets (CDPs), the product spans operational tracking (projects, quality, time, invoicing) and a commercial pipeline (since v1.1). The visual identity reinforces a single core metaphor: **growth**. Deep forest greens, green-tinted neutrals, and flat-with-border surfaces project quiet confidence without feeling clinical.

## Colors

### Primary — #16a34a (deep forest green)

Used sparingly: CTAs, active nav state, focus rings, chart primary series. A softer background variant (`primary-bg: rgba(22,163,74,.08)`) carries active-nav highlights so the green presence feels intentional, never loud.

### Neutrals are green-tinted, not grey

- `background #f5f7f5` — very subtle green bias, avoids the cold feel of pure `#fafafa`.
- `surface #f8faf8` — cards sit one step lighter than the page.
- `border #d4e4d4` — reads as green-grey, always visible, never harsh.

This tinting creates cohesion between branded and neutral elements without layered transparencies.

### Semantic palette is closed-set

All status colors come from the 6 semantic keys (`success`, `warning`, `danger`, `info`, `purple`, `gray`). The pipeline kanban uses `gray → info → warning → success` for `non_contacte → r1 → r2 → signe` (warmer = more commitment). Invoices reuse the same palette. **Never introduce a 7th color.**

### Dark mode

Base flips to `#0f1a0f` (near-black with green hint). Primary shifts one step brighter (`#22c55e`) to retain contrast. Borders and surfaces follow the green-tinted pattern.

## Typography

Single font family (system stack). No web fonts — aligns with Soluvia's pragmatic feel and keeps the app fast.

Hierarchy rules, from largest to smallest:

- **Page titles** (`page-title`): 20px 600 — e.g. "Pipeline commercial".
- **Section headers** (`section-header`): 14px 600 — card titles.
- **Eyebrow labels** (`eyebrow`): 11px 600 uppercase, `tracking: 0.05em`. Above dense metadata groups.
- **Body** (`body` / `body-sm`): 13-14px 400. Use `muted-foreground` for secondary info.
- **Numeric** (`numeric`): always `fontFeature: tnum` for counters, volumes, amounts.

## Layout

### Spacing rhythm

- Page content: `page-y` (24px) vertical.
- Cards stack with `section-gap` (24px).
- Inside a card: 16px between sub-sections, 8-12px for dense rows.
- Filter toolbars: `flex flex-wrap gap-2`.

### Density

Two levels only, never mixed in one section:

- **Default** (settings, forms): `card` padding (24px), larger typography.
- **Dense** (data tables, kanban cards): `card-compact` padding (16px) or 12px, smaller typography.

## Components

### Card

Flat-with-border. No shadow by default; subtle lift on hover (`0 1px 3px rgba(0,0,0,0.04)`) only when interactive. Radius `md` (10px).

### Badge

Pill-shaped, 11px 500, 12% opacity background of its semantic color with matching foreground. Only 6 badge colors exist; every status maps to one via a constants table (`STAGE_PROSPECT_COLORS`, `STATUT_FACTURE_COLORS`, ...).

### Side Sheet

Right-sliding panel at `min(800px, 95vw)`. Header: 1px bottom border, title on the left, single primary action on the right. Content scrolls; the panel itself doesn't.

### Sidebar

260px expanded, 64px collapsed. Active item: 3px left border + primary-tinted background + primary text color (three-signal indicator). Collapsed hides labels, keeps icons at full opacity.

### Kanban card (pipeline)

Dense variant. `p-3`, `text-sm` title, `text-xs` metadata. Cursor `grab` when draggable, `grabbing` when active. Dragging reduces source opacity to 0.4. Hover reveals a subtle `border-primary-light` ring.

## Rationale

SOLUVIA is used for hours a day by CDPs. Every decision above is calibrated for sustained use:

- Green-tinted neutrals reduce eye fatigue vs cold grey.
- System fonts → zero FOUT, instant loads.
- Flat borders over shadows → clean scrolling (no layered repainting).
- Closed-set semantic palette → consistent mental models (orange always means "attention, warning" — facture en retard, tâche qualité en retard, stage R2 du pipeline).

## Anti-patterns

- ❌ 7th badge color.
- ❌ Pure grey (`#f5f5f5`, `#e5e5e5`) — use green-tinted tokens.
- ❌ Web fonts (Inter, Geist, ...).
- ❌ Elevations > 1 — breaks the flat aesthetic.
- ❌ Mixed density within one card.
- ❌ Hardcoded colors — always reference CSS variables (`text-primary`, `bg-muted`, `border-border`, `text-muted-foreground`).
