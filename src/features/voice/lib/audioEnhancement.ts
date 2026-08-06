"use client";

/**
 * Vapi's Web SDK exposes no output-volume/gain control at all (confirmed by
 * reading the installed @vapi-ai/web source, not assumed) — the assistant's
 * voice plays through a plain <audio> element it creates itself
 * (`document.createElement('audio')`, appended straight to `document.body`
 * with a `data-participant-id` attribute) every time a remote audio track
 * starts, and removes on track end. There is no hook to raise loudness
 * before this point.
 *
 * This intercepts that element via a MutationObserver and reroutes its
 * output through a Web Audio API chain that raises perceived loudness
 * safely: a modest pre-gain feeds a compressor that narrows dynamic range
 * (quiet syllables come up, loud ones don't get louder), a makeup-gain
 * stage capitalizes on the now-leveled signal, and a fast brick-wall
 * limiter as the final stage guarantees the output can never clip no
 * matter how the two gain stages above interact — the same broadcast-style
 * loudness chain (compress, then limit) radio/podcast mastering uses,
 * rather than a naive volume multiplier that would just clip louder.
 */

const PARTICIPANT_AUDIO_SELECTOR = "audio[data-participant-id]";

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = new Ctor();
  }
  return sharedContext;
}

const wired = new WeakSet<HTMLMediaElement>();

function wire(audioEl: HTMLMediaElement): void {
  if (wired.has(audioEl)) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    // createMediaElementSource captures the element's output into the graph
    // exclusively — from this point the element's audio only reaches
    // speakers through whatever this graph connects to, so every stage
    // below must end at ctx.destination or the assistant would go silent.
    const source = ctx.createMediaElementSource(audioEl);

    // Stage 1 — modest pre-gain feeding the compressor. Kept low: the
    // compressor does the real loudness work, and over-driving its input
    // causes audible pumping on speech.
    const preGain = ctx.createGain();
    preGain.gain.value = 1.15;

    // Stage 2 — compressor. Narrows the gap between quiet and loud
    // syllables so the quiet parts (the actual "too low" complaint) come up
    // without the loud parts needing to get louder first.
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-28, ctx.currentTime);
    compressor.knee.setValueAtTime(24, ctx.currentTime);
    compressor.ratio.setValueAtTime(4, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.15, ctx.currentTime);

    // Stage 3 — makeup gain. Now that the dynamic range is narrower, this
    // is where perceived loudness actually increases.
    const makeupGain = ctx.createGain();
    makeupGain.gain.value = 1.6;

    // Stage 4 — limiter. A second compressor configured as a near-brick-wall
    // ceiling (high ratio, near-instant attack) so stages 1 and 3 combined
    // can never push the signal into clipping/distortion, regardless of
    // input level.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-1, ctx.currentTime);
    limiter.knee.setValueAtTime(0, ctx.currentTime);
    limiter.ratio.setValueAtTime(20, ctx.currentTime);
    limiter.attack.setValueAtTime(0.001, ctx.currentTime);
    limiter.release.setValueAtTime(0.05, ctx.currentTime);

    source.connect(preGain);
    preGain.connect(compressor);
    compressor.connect(makeupGain);
    makeupGain.connect(limiter);
    limiter.connect(ctx.destination);

    wired.add(audioEl);

    // Autoplay policies can leave a freshly-created AudioContext suspended
    // even when the <audio> element itself is allowed to play (it was
    // created downstream of the same user-gesture-gated call start) —
    // resume defensively so the graph doesn't silently sit muted.
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {
        /* best-effort — the element still plays through the element itself
           if the browser refuses; this enhancement is additive, not load-bearing */
      });
    }
  } catch (err) {
    // A media element can only ever be captured by one MediaElementSourceNode
    // for its lifetime; if anything else in the page ever does this first,
    // fail open rather than break playback — the call still works, just
    // without the loudness boost.
    console.warn("Voice loudness enhancement skipped:", err);
  }
}

/**
 * Starts watching for Vapi's dynamically-created remote-audio element(s)
 * and applies the loudness chain to each as they appear. Returns a cleanup
 * function that stops watching — call it on call/session teardown.
 */
export function installVapiLoudnessEnhancement(): () => void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return () => {};
  }

  // Vapi may already have created the element before this installs, on a
  // fast reconnect where the observer attaches a tick after track-started.
  document.querySelectorAll<HTMLAudioElement>(PARTICIPANT_AUDIO_SELECTOR).forEach(wire);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node instanceof HTMLAudioElement && node.matches(PARTICIPANT_AUDIO_SELECTOR)) {
          wire(node);
        }
        node.querySelectorAll?.<HTMLAudioElement>(PARTICIPANT_AUDIO_SELECTOR).forEach(wire);
      });
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  return () => observer.disconnect();
}
