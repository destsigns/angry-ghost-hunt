import { Pool } from 'pg';
import { project, Sim, Fx } from './sim';
import { DEBUFFS, LOCS, HIDDEN } from './data';
import { CARDS, TASKS, UNLOCK, s2Fare, SPECIAL_CAP_COST } from './pub';

const g = globalThis as any;
const url = process.env.DATABASE_URL;
const pool: Pool = g.__pool ?? (g.__pool = new Pool({ connectionString: url, ssl: url?.includes('render.com') ? { rejectUnauthorized: false } : undefined }));

export type TN = 'A' | 'B';
type Ride = { ts: number; route: string; fare: number; mtr: boolean; ic: number; fast: boolean };
type Team = { v: number; t: number; mode: 'up' | 'down'; period: number; deb: number[]; arr: number[]; stage: number[]; cards: number[]; done: number[]; hid: number[]; shield: boolean; forceExit: boolean; peekUntil: number; pend: number; free: number; rides: Ride[]; fx: Fx[]; capAdj: number; pm: number; tm: number; tf: boolean; s2: boolean; pass: number };
type Entry = { ts: number; vis: 'all' | 'A' | 'B' | 'gm'; s: string };
export type State = { run: boolean; over: TN | null; first5: TN | null; final: boolean; special: boolean; lunch: number | null; pool: number[]; notes: string[]; log: Entry[]; teams: Record<TN, Team>; links?: Record<string, string>; hist?: string[] };

const MIN = 60000;
const newTeam = (): Team => ({ v: 0, t: 0, mode: 'up', period: 6, deb: [], arr: [], stage: [0, 0, 0, 0, 0], cards: CARDS.map(() => 0), done: [], hid: [], shield: false, forceExit: false, peekUntil: 0, pend: 0, free: 0, rides: [], fx: [], capAdj: 0, pm: 1, tm: 1, tf: false, s2: false, pass: 0 });
const fresh = (): State => ({ run: false, over: null, first5: null, final: false, special: false, lunch: null, pool: DEBUFFS.map((_, i) => i + 1), notes: [], log: [], teams: { A: newTeam(), B: newTeam() }, links: {} });
const other = (t: TN): TN => (t === 'A' ? 'B' : 'A');
const has = (x: Team, id: number) => x.deb.includes(id);
const baseCap = (x: Team) => (has(x, 10) ? 800 : 900) + x.capAdj;
const capNow = (x: Team, now: number) => baseCap(x) + x.fx.filter((f) => f.k === 'cap' && f.until > now).reduce((a, f) => a + (f.d || 0), 0);
const relOf = (x: Team) => (has(x, 10) ? 600 : 700);
const sp = (x: Team, run: boolean, hide = false): Sim => ({ v: x.v, t: run ? x.t : 0, mode: x.mode, period: x.period * x.pm, k4: has(x, 4), cap: baseCap(x), rel: relOf(x), fx: x.fx.filter((f) => ['fast', 'pause', 'cap'].includes(f.k) && !(hide && f.sec)) });
const sgn = (n: number) => (n >= 0 ? '+' : '') + Math.round(n);
const L = (s: State, vis: Entry['vis'], text: string) => { s.log.push({ ts: Date.now(), vis, s: text }); if (s.log.length > 150) s.log.shift(); };
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function bound(s: State, T: TN) {
  const x = s.teams[T];
  if (x.mode === 'up' && x.v >= capNow(x, Date.now())) { x.mode = 'down'; L(s, 'all', `🔥 Team ${T} 怒鬼值爆滿！下一站必須下車`); }
  else if (x.mode === 'down' && x.v <= relOf(x)) x.mode = 'up';
}

function advance(s: State, now: number) {
  if (!s.run) return;
  for (const T of ['A', 'B'] as TN[]) {
    const x = s.teams[T], was = x.mode;
    const p = project(sp(x, true), now);
    x.v = p.v; x.t = p.t; x.mode = p.mode;
    x.fx = x.fx.filter((f) => f.until > x.t);
    if (was === 'up' && x.mode === 'down') L(s, 'all', `🔥 Team ${T} 怒鬼值爆滿！下一站必須下車`);
    if (x.pend && x.v >= 400) { x.v -= 400; x.pend = 0; L(s, T, '午餐任務減值 -400 已生效'); }
  }
}

// Every non-time change to an anger value goes through here (so debuffs 3, 9 and the "cancel next reduction" card always apply).
function change(s: State, T: TN, d0: number, label: string, vis: Entry['vis'] = 'all', raw = false) {
  const x = s.teams[T], O = other(T);
  let d = d0;
  if (!raw && has(x, 3)) d = Math.round(d > 0 ? d * 1.2 : d * 0.8);
  if (d < 0 && x.shield) { x.shield = false; L(s, 'gm', `Team ${T} 的減值被「${CARDS[0].n}」取消：${label} ${Math.round(d)}`); return; }
  const before = x.v;
  x.v = Math.max(0, x.v + d);
  L(s, vis, `Team ${T} ${label} ${sgn(x.v - before)} → ${Math.round(x.v)}`);
  if (d < 0 && has(x, 9) && !raw) {
    const o = s.teams[O], e = Math.max(-o.v, 0.2 * d);
    o.v += e; L(s, O, `Team ${O} 額外減值 ${sgn(e)} → ${Math.round(o.v)}`); bound(s, O);
  }
  bound(s, T);
}

function useCard(s: State, T: TN, a: any, now: number) {
  const O = other(T), x = s.teams[T], o = s.teams[O], id = Number(a.id), c = CARDS[id];
  if (!c) throw new Error('card?');
  if (x.fx.some((f) => f.k === 'nocard' && f.until > now)) throw new Error('該隊被封鎖：20分鐘內不能使用功能卡');
  if (c.sp && !s.special) throw new Error('特別功能卡尚未開放');
  const loc = Number(a.loc), dd = Number(a.deb);
  if (id === 9 && !(loc >= 0 && loc < 5)) throw new Error('請指定地點');
  if (id === 20 && !x.deb.includes(dd)) throw new Error('請選擇要轉移的詛咒');
  if (a.free) { if (x.free < 1) throw new Error('沒有免費機會'); x.free--; }
  else { if (x.cards[id] < 1) throw new Error('沒有此功能卡'); x.cards[id]--; }
  L(s, T, `🃏 已使用「${c.n}」`);
  if (has(x, 5)) change(s, T, 50, '發動功能卡附加');
  if (c.atk) {
    const sh = o.fx.findIndex((f) => f.k === 'shield' && f.until > now);
    if (sh >= 0) { o.fx.splice(sh, 1); L(s, T, '🛡 被對方護盾擋下，功能卡白白浪費'); L(s, O, '🛡 護盾擋下了對方的一次攻擊'); return; }
  }
  const add = (t: Team, f: Fx) => t.fx.push(f);
  switch (id) {
    case 0: o.shield = true; break;
    case 1: o.forceExit = true; L(s, O, '⚠️ 對方使用功能卡：必須在下一站落車（乘港鐵須出閘）'); break;
    case 2: x.peekUntil = now + 10 * MIN; break;
    case 3: {
      const cand = [0, 1, 2, 3, 4].filter((i) => !o.arr.includes(i) && o.stage[i] < 4);
      if (!cand.length) { L(s, T, '沒有可鎖定的地點，功能卡落空'); break; }
      const l = pick(cand); add(o, { k: 'lock', loc: l, until: now + 20 * MIN }); L(s, O, `🔒 地點 ${l + 1} 的解鎖按鈕被鎖死 20 分鐘`); break;
    }
    case 4: add(o, { k: 'fast', until: now + 20 * MIN }); L(s, O, '⏩ 接下來 20 分鐘怒鬼值增加速度翻倍'); break;
    case 5: add(o, { k: 'mute', until: now + 15 * MIN }); L(s, O, '🤐 15 分鐘內不能提及任何地方、街道、大廈名稱及路線編號'); break;
    case 6: add(o, { k: 'store', until: now + 10 * MIN }); L(s, O, '🏪 須在 10 分鐘內前往便利店消費，否則怒鬼值 +300'); break;
    case 7: x.tf = true; L(s, T, '↪ 下一次乘車的「車資×10」怒鬼值將由對方承擔'); break;
    case 8: add(x, { k: 'phone', until: now + 5 * MIN }); break;
    case 9: x.stage[loc] = 4; L(s, T, `⬆️ 地點 ${loc + 1} 已直接升至最終階段`); break;
    case 10: add(x, { k: 'pause', until: now + 20 * MIN }); break;
    case 11: add(x, { k: 'cap', d: 150, until: now + 20 * MIN }); break;
    case 12: add(o, { k: 'cap', d: -100, sec: true, until: now + 20 * MIN }); L(s, 'gm', `Team ${O} 爆滿上限 -100（20分鐘，對方不知）`); break;
    case 13: add(x, { k: 'shield', until: now + 30 * MIN }); break;
    case 14: x.pass++; break;
    case 15: {
      const cand = [0, 1, 2, 3, 4].filter((i) => !o.arr.includes(i) && o.stage[i] >= 1);
      if (!cand.length) { L(s, T, '對方沒有可降級的地點，功能卡落空'); break; }
      const l = pick(cand); o.stage[l]--; L(s, O, `⬇️ 地點 ${l + 1} 被強制降級`); break;
    }
    case 16: add(o, { k: 'nocard', until: now + 20 * MIN }); L(s, O, '🚫 20 分鐘內不能使用任何功能卡'); break;
    case 17: add(o, { k: 'noesc', until: now + 20 * MIN }); L(s, O, '🚫 20 分鐘內不能使用扶手電梯或升降機'); break;
    case 18: change(s, T, 200, '功能卡：雙方 +200'); change(s, O, 200, '功能卡：雙方 +200'); break;
    case 19: { const t = Math.round(x.v * 0.2); x.v -= t; o.v += t; L(s, 'all', `Team ${T} 轉移 ${t} 怒鬼值予 Team ${O}`); bound(s, T); bound(s, O); break; }
    case 20: x.deb = x.deb.filter((d) => d !== dd); o.deb.push(dd); L(s, T, `🔁 已將詛咒 #${dd} 轉移給對方`); L(s, O, `💀 對方轉移了靈魂詛咒 #${dd} 給你：${DEBUFFS[dd - 1]}`); bound(s, T); bound(s, O); break;
    case 21: x.s2 = true; L(s, T, '🚇 車費改按「兩蚊兩折」計算'); break;
    case 22: x.pm = 2; x.tm = 1.5; L(s, T, '🐌 自然增加速度永久減半，公開任務獎勵 ×1.5'); break;
  }
}

function exec(s0: State, a: any, now: number): State {
  if (a.type === 'noop') return s0;
  if (a.type === 'reset') { const r = fresh(); r.links = s0.links || {}; return r; } // links survive a reset
  if (a.type === 'setlink') {
    const i = Number(a.loc), st = Number(a.stage), url = String(a.url || '').trim().slice(0, 300);
    if (!(i >= 0 && i < 6 && st >= 0 && st <= 4)) throw new Error('地點／階段無效'); // i = 5 is the final location (stage 0 only)
    if (url && !/^https?:\/\//i.test(url)) throw new Error('連結必須以 https:// 開頭');
    const r: State = JSON.parse(JSON.stringify(s0)); r.links = { ...(r.links || {}), [`${i}-${st}`]: url }; return r;
  }
  if (a.type === 'undo') {
    const h = [...(s0.hist || [])], p = h.pop();
    if (!p) return s0;
    const r = JSON.parse(p) as State; r.hist = h; r.links = s0.links || {}; advance(r, now); return r;
  }
  const { hist, ...cur } = s0;
  const snap = JSON.stringify(cur);
  const s: State = JSON.parse(snap);
  const T = a.team as TN;
  const needT = ['adjust', 'setv', 'arrive', 'ride', 'buy', 'use', 'unlock', 'task', 'hidden', 'win', 'forceclear', 'passuse', 'storeok', 'storefail'].includes(a.type);
  if (needT && !['A', 'B'].includes(T)) throw new Error('team?');
  const x = needT ? s.teams[T] : (null as any), O = needT ? other(T) : ('A' as TN);

  switch (a.type) {
    case 'start':
      if (s.run) throw new Error('已經開始');
      s.run = true; for (const t of ['A', 'B'] as TN[]) { s.teams[t].t = now; s.teams[t].v = 0; s.teams[t].mode = 'up'; }
      L(s, 'all', '👻 遊戲開始！怒鬼值啟動'); break;
    case 'adjust': { const d = Number(a.delta); if (!isFinite(d)) throw new Error('number?'); change(s, T, d, String(a.note || 'GM 調整').slice(0, 20), 'all', true); break; }
    case 'setv': { const v = Number(a.value); if (!isFinite(v) || v < 0) throw new Error('number?'); x.v = v; L(s, 'all', `Team ${T} 怒鬼值設為 ${Math.round(v)}`); bound(s, T); break; }
    case 'arrive': {
      const i = Number(a.loc);
      if (!(i >= 0 && i < 5) || x.arr.includes(i)) throw new Error('地點無效或已到達');
      x.arr.push(i);
      L(s, 'all', `📍 Team ${T} 抵達地點 ${i + 1}（${x.arr.length}/5）`);
      if (s.pool.length) {
        const id = s.pool.splice(Math.floor(Math.random() * s.pool.length), 1)[0];
        x.deb.push(id); L(s, T, `💀 你抽中靈魂詛咒 #${id}：${DEBUFFS[id - 1]}`);
      }
      if (x.arr.length === 2 && !s.special) { s.special = true; L(s, 'all', '📢 特別功能卡 S1–S3 現已開放購買！'); }
      if (x.arr.length === 5 && !s.first5) { s.first5 = T; L(s, 'gm', `Team ${T} 最先抵達第五個地點，可公布最終地點`); }
      bound(s, T); break;
    }
    case 'ride': {
      const fare0 = Number(a.fare); if (!(fare0 >= 0)) throw new Error('fare?');
      const fare = x.s2 ? s2Fare(fare0) : fare0, ic = Number(a.ic) || 0;
      const part = fare * 10 * (a.mtr && has(x, 1) ? 2 : 1);
      let extra = 0; if (has(x, 8)) extra += 50 * ic; if (has(x, 2) && a.fast) extra += 100;
      x.rides.push({ ts: now, route: String(a.route || '').slice(0, 80), fare: fare0, mtr: !!a.mtr, ic, fast: !!a.fast }); x.rides = x.rides.slice(-10);
      x.forceExit = false;
      const tf = x.tf; x.tf = false;
      if (tf) change(s, O, part, `承擔對方車資（功能卡）$${fare0}`);
      if (tf ? extra > 0 : part + extra > 0) change(s, T, tf ? extra : part + extra, `乘車 $${fare0}`);
      if (!tf && has(s.teams[O], 7)) change(s, O, 0.2 * part, '負擔對方車資', O);
      break;
    }
    case 'buy': {
      if (!s.teams.A.arr.length && !s.teams.B.arr.length) throw new Error('功能卡尚未開放');
      const id = Number(a.id), c = CARDS[id]; if (!c) throw new Error('card?');
      if (c.sp) {
        if (!s.special) throw new Error('特別功能卡尚未開放');
        x.cards[id]++; x.capAdj -= SPECIAL_CAP_COST; L(s, T, `購買特別功能卡「${c.n}」：怒鬼值爆滿上限 −${SPECIAL_CAP_COST}`); bound(s, T);
      } else { x.cards[id]++; change(s, T, c.c, `購買「${c.n}」`); }
      break;
    }
    case 'use': useCard(s, T, a, now); break;
    case 'passuse': if (x.pass < 1) throw new Error('沒有地圖許可'); x.pass--; break;
    case 'storeok': x.fx = x.fx.filter((f) => f.k !== 'store'); L(s, T, '🏪 便利店任務已完成'); break;
    case 'storefail': x.fx = x.fx.filter((f) => f.k !== 'store'); change(s, T, 300, '未完成便利店任務'); break;
    case 'unlock': {
      const i = Number(a.loc); if (!s.run) throw new Error('遊戲尚未開始');
      if (!(i >= 0 && i < 5) || x.stage[i] >= 4) throw new Error('已是最低難度');
      if (x.fx.some((f) => f.k === 'lock' && f.loc === i && f.until > now)) throw new Error('此地點的解鎖按鈕被鎖定');
      x.stage[i]++; change(s, T, UNLOCK, `解鎖地點 ${i + 1} 階段 ${x.stage[i]}`); break;
    }
    case 'task': {
      const i = Number(a.id), t = TASKS[i]; if (!t || x.done.includes(i)) throw new Error('任務無效或已完成');
      let r = t.r;
      if (t.v) { const xv = Number(a.x); if (!isFinite(xv)) throw new Error('請輸入數值'); r = Math.max(0, 150 - Math.abs(xv - 150)); }
      r = Math.round(r * x.tm);
      x.done.push(i); change(s, T, -r, `完成任務「${t.n}」`); break;
    }
    case 'hidden': {
      const i = Number(a.id), h = HIDDEN[i]; if (!h || x.hid.includes(i)) throw new Error('任務無效或已達成');
      x.hid.push(i); change(s, T, has(x, 6) ? 0.5 * h.r : -h.r, `隱藏任務「${h.n}」`, T); break;
    }
    case 'forceclear': x.forceExit = false; break;
    case 'final': {
      const lead = s.first5; if (!lead) throw new Error('未有隊伍到達第五個地點');
      const ld = s.teams[lead], tr = s.teams[other(lead)], half = a.mode === 'half';
      s.final = true; tr.v = half ? tr.v / 2 : 0; ld.period = 4; tr.period = 9; ld.t = tr.t = now; tr.free++;
      if (tr.mode === 'down' && tr.v <= relOf(tr)) tr.mode = 'up';
      L(s, 'all', `🏁 最終地點公布！Team ${lead} 領先（每4秒+1）；Team ${other(lead)} 每9秒+1、怒鬼值${half ? '減半' : '歸零'}，獲一次免費功能卡及對方實時定位`);
      break;
    }
    case 'win': s.over = T; s.run = false; L(s, 'all', `🏆 Team ${T} 抵達最終地點，遊戲結束！`); break;
    case 'lunchdraw': s.lunch = 100 + Math.floor(Math.random() * 201); L(s, 'gm', `午餐目標金額：$${s.lunch}`); break;
    case 'lunchwin': {
      const W = a.winner as TN; if (!['A', 'B'].includes(W)) throw new Error('team?');
      const w = s.teams[W];
      if (w.v >= 400) change(s, W, -400, '午餐任務'); else { w.pend = 400; L(s, W, '午餐任務勝出：減值將於怒鬼值≥400時生效'); }
      change(s, other(W), 300, '午餐任務'); s.lunch = null; break;
    }
    case 'note': { const t = String(a.text || '').slice(0, 120); if (!t) throw new Error('text?'); s.notes = [...s.notes, t].slice(-4); L(s, 'all', `📢 ${t}`); break; }
    default: throw new Error('unknown action');
  }
  s.hist = [...(hist || []), snap].slice(-15);
  return s;
}

export function view(s: State, who: string, now: number) {
  const simOf = (T: TN, hide: boolean) => sp(s.teams[T], s.run, hide);
  const common = { now, run: s.run, over: s.over, final: s.final, special: s.special, lead: s.final ? s.first5 : null, notes: s.notes, open: s.teams.A.arr.length + s.teams.B.arr.length > 0 };
  if (who === 'GM') return { ...common, gm: true, sim: { A: simOf('A', false), B: simOf('B', false) }, teams: s.teams, log: s.log, lunch: s.lunch, first5: s.first5, links: s.links || {}, locs: LOCS.map((l) => l.name), hidden: HIDDEN.map((h) => h.n) };
  const T = who as TN, x = s.teams[T], o = s.teams[other(T)];
  const { rides, pend, shield, fx, capAdj, pm, tm, s2, ...mine } = x;
  return {
    ...common, me: T, sim: { me: simOf(T, true), opp: simOf(other(T), true) }, oppArr: o.arr.length,
    mine: { ...mine, deb: x.deb.map((id) => ({ id, t: DEBUFFS[id - 1] })), hid: x.hid.map((i) => HIDDEN[i].n) },
    fx: fx.filter((f) => !f.sec && f.until > now).map((f) => ({ k: f.k, until: f.until, loc: f.loc, d: f.d })),
    locs: LOCS.map((l, i) => { const st = x.stage[i]; return { st, link: (s.links || {})[`${i}-${st}`] || l.links[st] || '', arrived: x.arr.includes(i), lock: Math.max(0, ...fx.filter((f) => f.k === 'lock' && f.loc === i && f.until > now).map((f) => f.until)) }; }),
    finalLink: s.final ? (s.links || {})['5-0'] || '' : null,
    peek: x.peekUntil > now ? { until: x.peekUntil, rides: o.rides.slice(-3) } : null,
    log: s.log.filter((e) => e.vis === 'all' || e.vis === T),
  };
}

export async function act(action: any | null): Promise<{ s: State; now: number }> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('CREATE TABLE IF NOT EXISTS ghost (id int PRIMARY KEY, data jsonb NOT NULL)');
    await c.query('INSERT INTO ghost VALUES (1, $1) ON CONFLICT DO NOTHING', [fresh()]);
    const { rows } = await c.query('SELECT data FROM ghost WHERE id = 1 FOR UPDATE');
    const now = Date.now();
    let s: State = rows[0].data;
    if (!s.teams?.A?.fx) { const f = fresh(); f.links = s.links || {}; s = f; } // state saved by an older version
    advance(s, now);
    if (action) { s = exec(s, action, now); await c.query('UPDATE ghost SET data = $1 WHERE id = 1', [s]); }
    await c.query('COMMIT');
    return { s, now };
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
