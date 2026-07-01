// Lightweight notification sound using Web Audio API.
// Avoids external assets so the app works fully offline.
let ctx: AudioContext | null = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function playNotificationSound() {
  const c = getCtx();
  if (!c) return;
  try {
    const now = c.currentTime;
    [880, 1320].forEach((freq, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(g);
      g.connect(c.destination);
      g.gain.setValueAtTime(0, now + i * 0.18);
      g.gain.linearRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.35);
      o.start(now + i * 0.18);
      o.stop(now + i * 0.18 + 0.4);
    });
  } catch {
    /* ignore */
  }
}
