# Frontend Architecture Specification

## Framework & State Stack
- **Next.js 14 (App Router)**: Route groups `(public)` and `(admin)`.
- **State Management**:
  - `useVoiceSession` custom hook managing voice lifecycle states.
  - React Context for active user session and theme.
- **Styling Engine**: Tailwind CSS + custom glassmorphic utility classes.
- **Icons & Visuals**: `lucide-react`, Framer Motion, HTML5 WebAudio Canvas API.
