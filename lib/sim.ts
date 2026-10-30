// k: fast (time-increase speed x2) | pause (no natural increase) | cap (+d to meltdown cap) | mute | lock | nocard | noesc | store | phone | shield
export type Fx = { k: string; until: number; d?: number; loc?: number; sec?: boolean };
export type Sim = { v: number; t: number; mode: 'up' | 'down'; period: number; k4: boolean; cap: number; rel: number; fx: Fx[] };
// Anger-value clock. t === 0 means "not running". Shared by server and client (client uses it for live display).
export function project(x: Sim, now: number) {
  let { v, mode, t } = x;
  if (!t) return { v, t, mode };
  for (let i = 0; i < 20000; i++) {
    let per = x.period, pause = false, cap = x.cap;
    for (const f of x.fx) if (f.until > t) { if (f.k === 'fast') per /= 2; else if (f.k === 'pause') pause = true; else if (f.k === 'cap') cap += f.d || 0; }
    const ms = per * 1000;
    if (t + ms > now) break;
    t += ms;
    if (mode === 'up') { if (!pause) v += x.k4 && v < 300 ? 1.5 : 1; if (v >= cap) mode = 'down'; }
    else { v = Math.max(0, v - 1); if (v <= x.rel) mode = 'up'; }
  }
  return { v, t, mode };
}
