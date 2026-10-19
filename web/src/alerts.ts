let ctx: AudioContext | null = null;

function beep(freq: number, at: number, dur = 0.12, vol = 0.15) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + at);
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + dur + 0.05);
}

/** Must be called from a click (browsers only allow audio after user interaction). */
export function armAudio() {
  try {
    ctx = ctx ?? new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => {});
  } catch { /* audio unavailable */ }
}

export function softAlert() { beep(880, 0); }

export function loudAlert(title: string, body: string) {
  [0, 0.18, 0.36].forEach((t, i) => beep(i === 2 ? 1320 : 990, t, 0.14, 0.25));
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); } catch { /* blocked */ }
  const orig = document.title;
  let n = 0;
  const id = window.setInterval(() => {
    document.title = n % 2 ? orig : `● ${title}`;
    if (++n > 8) { window.clearInterval(id); document.title = orig; }
  }, 600);
}
