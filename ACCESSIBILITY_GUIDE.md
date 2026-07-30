# WCAG 2.1 AA Accessibility Specification

## Key Requirements:
1. **Screen Reader Announcements**:
   - `aria-live="polite"` applied to status badges so state changes ("Listening", "Speaking", "Thinking") are read aloud.
   - `aria-live="assertive"` for speech transcript additions.
2. **Keyboard Navigation**:
   - Focus outline (`ring-2 ring-sky-500`) visible on all buttons and inputs.
   - Mic toggle controllable via `Space` or `Enter` keys.
3. **Contrast Verification**:
   - Slate 50 text (`#f8fafc`) on obsidian background (`#090d16`) yields a contrast ratio of `18.5:1` (passes AAA requirement).
