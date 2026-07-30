# Component Library Specification

This document details the interface, props, variants, and states for all reusable React components in `src/shared/ui/` and `src/features/`.

## 1. Voice Microphone Button (`VoiceMicButton.tsx`)
- **Purpose**: Main interactive touchpoint for starting/stopping the voice conversation.
- **Props**:
  - `state`: `"idle" | "connecting" | "listening" | "speaking" | "thinking"`
  - `onClick`: `() => void`
  - `size`: `"lg" | "xl"`
- **States & Animations**:
  - `idle`: Static glass sphere with glowing border.
  - `listening`: Pulsing concentric blue ripples (`scale 1.0` -> `1.25`).
  - `speaking`: Rapid frequency wave pulsing.
  - `thinking`: Rotating ambient gradient ring.

## 2. Voice Status Indicator (`VoiceStatusBadge.tsx`)
- **Purpose**: Displays real-time voice connection and agent state.
- **Props**:
  - `state`: Voice state enum
  - `timer`: `number` (call duration in seconds)
- **Variants**: Badge pill with green dot for connected, amber dot for reconnecting.

## 3. Audio Frequency Visualizer (`AudioVisualizer.tsx`)
- **Purpose**: HTML5 Canvas rendering of incoming/outgoing WebAudio frequency spectrum.
- **Props**:
  - `audioStream`: `MediaStream | null`
  - `isActive`: `boolean`

## 4. Transcript Viewer (`TranscriptViewer.tsx`)
- **Purpose**: Collapsible container showing real-time text transcription of speech.
- **Props**:
  - `messages`: `Array<{ role: "user" | "assistant"; content: string }>`

## 5. Metric KPI Card (`MetricCard.tsx`)
- **Purpose**: Display numerical metrics in Admin Dashboard.
- **Props**:
  - `title`: `string`
  - `value`: `string | number`
  - `trend`: `string` (e.g. `"+14.2%"` vs last week)
  - `icon`: `LucideIcon`

## 6. Lead Score Badge (`LeadScoreBadge.tsx`)
- **Purpose**: Visually denote lead score priority in Admin tables.
- **Props**:
  - `category`: `"HIGH" | "MEDIUM" | "LOW"`
  - `score`: `number`
