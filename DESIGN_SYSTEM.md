# Design System Specification & Token Architecture

## 1. Color Palette Tokens

The color system uses CSS custom properties mapped to Tailwind CSS tokens. It features a deep midnight obsidian backdrop with glowing glass panels and electric sky accents.

```css
:root {
  /* Brand Accents */
  --color-brand-primary: #0ea5e9; /* Sky 500 */
  --color-brand-hover: #0284c7;   /* Sky 600 */
  --color-brand-glow: rgba(14, 165, 233, 0.25);

  /* Background Layers */
  --color-bg-base: #090d16;        /* Deep Obsidian */
  --color-bg-surface: rgba(255, 255, 255, 0.03); /* Glass Layer 1 */
  --color-bg-surface-hover: rgba(255, 255, 255, 0.06);
  --color-bg-elevated: rgba(255, 255, 255, 0.08);

  /* Borders & Dividers */
  --color-border-subtle: rgba(255, 255, 255, 0.08);
  --color-border-focus: rgba(14, 165, 233, 0.5);

  /* Typography */
  --color-text-primary: #f8fafc;   /* Slate 50 */
  --color-text-secondary: #94a3b8; /* Slate 400 */
  --color-text-muted: #64748b;     /* Slate 500 */

  /* Functional Status */
  --color-status-success: #10b981; /* Emerald 500 */
  --color-status-warning: #f59e0b; /* Amber 500 */
  --color-status-error: #ef4444;   /* Red 500 */
  --color-status-info: #3b82f6;    /* Blue 500 */
}
```

## 2. Typography Scale
- **Display**: `font-extrabold text-4xl sm:text-5xl tracking-tight` (36px / 48px)
- **H1 / Title**: `font-bold text-2xl sm:text-3xl tracking-tight` (24px / 30px)
- **H2 / Subtitle**: `font-semibold text-xl tracking-normal` (20px)
- **Body Regular**: `font-normal text-sm sm:text-base leading-relaxed` (14px / 16px)
- **Caption / Small**: `font-medium text-xs text-slate-400` (12px)
- **Monospace Code / Metrics**: `font-mono text-xs tracking-wide`

## 3. Spacing & Grid System
- 4px baseline grid (`p-1`, `p-2`, `p-4`, `p-6`, `p-8`, `p-12`).
- Responsive Container Max Widths:
  - Public Voice Card: `max-w-xl` (576px)
  - Admin Dashboard Shell: `max-w-7xl` (1280px)

## 4. Glassmorphic Elevation & Blur Tokens
- **Glass Panel**: `backdrop-blur-md bg-white/[0.03] border border-white/[0.08]`
- **Glass Card Hover**: `hover:bg-white/[0.06] hover:border-white/[0.15] transition-all duration-200`
- **Glowing Mic Sphere**: `shadow-[0_0_50px_rgba(14,165,233,0.3)]`

## 5. Motion Guidelines & Timings
- **Fast Micro-interaction**: `150ms ease-out` (Button hover, tab switch)
- **Standard Transition**: `250ms cubic-bezier(0.4, 0, 0.2, 1)` (Modal fade, drawer slide)
- **Voice Pulse Loop**: `2000ms infinite ease-in-out` (Listening ripple effect)
