'use client';
import { useEffect, useRef, useState } from 'react';
import { project } from '../lib/sim';
import { CARDS, TASKS, UNLOCK } from '../lib/pub';

let OFF = 0; // server-minus-client clock offset
const store = (k: string, v?: string) => { try { return v === undefined ? localStorage.getItem(k) : (v ? localStorage.setItem(k, v) : localStorage.removeItem(k), v); } catch { return null; } };
const hm = (ts: number) => new Date(ts).toTimeString().slice(0, 5);
const FX: Record<string, (f: any) => string> = {
  mute: (f) => `🤐 至 ${hm(f.until)}：不能提及任何地方、街道、大廈名稱及路線編號`,
  lock: (f) => `🔒 地點 ${f.loc + 1} 的解鎖按鈕被鎖定至 ${hm(f.until)}`,
  nocard: (f) => `🚫 至 ${hm(f.until)}：不能使用任何功能卡`,
  noesc: (f) => `🚫 至 ${hm(f.until)}：不能使用扶手電梯或升降機`,
  store: (f) => `🏪 須於 ${hm(f.until)} 前到便利店消費，否則怒鬼值 +300`,
  phone: (f) => `📞 至 ${hm(f.until)}：可打電話／即時訊息詢問任何人（含 GM）`,
  fast: (f) => `⏩ 至 ${hm(f.until)}：怒鬼值增加速度翻倍`,
  pause: (f) => `⏸ 至 ${hm(f.until)}：自然增加暫停`,
  cap: (f) => `🔺 至 ${hm(f.until)}：爆滿上限 ${f.d > 0 ? '+' : ''}${f.d}`,
  shield: (f) => `🛡 至 ${hm(f.until)}：護盾（可抵銷對方一次攻擊）`,
};
const STAGE = ['階段 0', '階段 1', 'NMPZ', 'No Move', 'Move'];

function Gauge({ title, sim, sub }: any) {
  const p = project(sim, Date.now() + OFF);
  const pct = Math.min(100, (p.v / sim.cap) * 100);
  return (
    <div className={`gauge ${p.mode === 'down' ? 'down' : ''}`}>
      <div className="gl">{title}</div>
      <div className="gv">{Math.round(p.v)}<small> / {sim.cap}</small></div>
      <div className="bar"><i className={pct > 80 ? 'hot' : ''} style={{ width: pct + '%' }} /></div>
      {sub && <div className="gs">{sub}</div>}
      {p.mode === 'down' && <div className="warn">😱 爆滿！下一站必須下車，冷卻至 {sim.rel} 才可繼續</div>}
    </div>
  );
}

export default function Page() {
  const [s, setS] = useState<any>(null);
  const [me, setMe] = useState('');
  const [gm, setGm] = useState(false);
  const [pin, setPin] = useState('');
  const [pending, setPending] = useState(''), [tpin, setTpin] = useState('');
  const [tab, setTab] = useState('總覽');
  const [msg, setMsg] = useState('');
  const [gt, setGt] = useState<'A' | 'B'>('A');
  const [f, setF] = useState({ fare: '', route: '', mtr: false, ic: '0', fast: false });
  const [adj, setAdj] = useState(''), [say, setSay] = useState(''), [fm, setFm] = useState('reset'), [free, setFree] = useState(false), [ul, setUl] = useState(0), [ud, setUd] = useState(0);
  const [lk, setLk] = useState<Record<string, string>>({});
  const [, setTk] = useState(0);
  const pinRef = useRef(''), tpinRef = useRef(''), gmRef = useRef(false), meRef = useRef('');
  gmRef.current = gm; meRef.current = me;

  const hdr = () => ({ 'x-gm-pin': pinRef.current, 'x-team-pin': tpinRef.current });
  function ingest(d: any) { OFF = d.now - Date.now(); setS(d); }
  async function poll() {
    if (!gmRef.current && !meRef.current) return;
    try {
      const r = await fetch('/api/state?team=' + meRef.current, { cache: 'no-store', headers: hdr() });
      if (r.ok) ingest(await r.json()); else if (r.status === 401 && !gmRef.current) logout('PIN 已失效');
    } catch {}
  }
  useEffect(() => {
    setMe(store('my-team') || ''); tpinRef.current = store('my-pin') || '';
    const p = store('gm-pin'); if (p) { pinRef.current = p; send({ type: 'noop' }, true); }
    const k = setInterval(() => setTk((x) => x + 1), 1000);
    return () => clearInterval(k);
  }, []);
  useEffect(() => {
    const tick = () => { if (!document.hidden) poll(); };
    tick(); const t = setInterval(tick, 15000);
    document.addEventListener('visibilitychange', tick); window.addEventListener('focus', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); };
  }, [me, gm]);

  async function send(a: any, silent = false) {
    const r = await fetch('/api/state', { method: 'POST', headers: { 'content-type': 'application/json', ...hdr() }, body: JSON.stringify({ team: meRef.current, ...a }) });
    if (r.status === 401) { if (!silent) setMsg('PIN 錯誤'); if (a.type === 'noop') setGm(false); return; }
    const d = await r.json();
    if (!r.ok) { setMsg(d.error || '錯誤'); return; }
    setMsg(''); if (d.gm) setGm(true); ingest(d);
  }
  function unlock() { pinRef.current = pin; store('gm-pin', pin); send({ type: 'noop' }); }
  function reset() { setS(null); }
  function logout(m = '') { store('my-team', ''); store('my-pin', ''); tpinRef.current = ''; reset(); setMe(''); setMsg(m); }
  async function login() {
    const r = await fetch('/api/state?team=' + pending, { cache: 'no-store', headers: { 'x-team-pin': tpin } });
    if (!r.ok) { setMsg('PIN 錯誤'); return; }
    store('my-team', pending); store('my-pin', tpin); tpinRef.current = tpin;
    reset(); setMe(pending); setMsg(''); setPending(''); setTpin('');
  }

  const head = <header><span className="ghost">👻</span><h1>怒鬼<em>尋蹤</em></h1></header>;
  const footer = (
    <footer>
      {!gm && <><input type="password" placeholder="GM PIN" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && unlock()} /><button onClick={unlock}>GM</button></>}
      {!gm && me && <button onClick={() => logout()}>登出</button>}
      {gm && <button onClick={() => { store('gm-pin', ''); pinRef.current = ''; setGm(false); setS(null); }}>退出 GM</button>}
      <span className="hint">{msg}</span>
    </footer>
  );

  if (!gm && !me) return (
    <main>{head}
      <p className="hint" style={{ margin: '24px 0 10px' }}>選擇你的隊伍</p>
      <div className="pick">{['A', 'B'].map((t) => <button key={t} className={t} onClick={() => { setPending(t); setTpin(''); setMsg(''); }}>Team {t}</button>)}</div>
      {pending && <div className="row" style={{ marginTop: 14 }}><input type="password" autoFocus placeholder={`Team ${pending} PIN`} value={tpin} onChange={(e) => setTpin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && login()} /><button onClick={login}>進入</button></div>}
      {footer}
    </main>
  );
  if (!s) return <main>{head}<p className="hint">載入中…</p>{footer}</main>;

  const tabs = gm ? ['總覽', 'GM', '連結', '紀錄'] : ['總覽', '地點', '任務', '功能卡', '詛咒', '紀錄'];
  const opp = me === 'A' ? 'B' : 'A';
  const T = gm ? s.teams[gt] : null;
  const num = (k: string, v: any) => setF({ ...f, [k]: v });

  return (
    <main>
      {head}
      <nav>{tabs.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>
      {msg && <div className="ban bad" onClick={() => setMsg('')}>{msg}</div>}

      {tab === '總覽' && (
        <>
          {s.over && <div className="ban big">{gm || s.over === me ? `🏆 Team ${s.over} 勝出！` : '💀 落敗！請即時無視所有限制，儘快到達最終地點拍攝 outro'}</div>}
          {!s.run && !s.over && <div className="ban">遊戲尚未開始</div>}
          {s.notes.map((n: string, i: number) => <div key={i} className="ban note">📢 {n}</div>)}
          {!gm && s.fx.map((f: any, i: number) => <div key={i} className="ban">{FX[f.k]?.(f)}</div>)}
          {!gm && s.mine.pass > 0 && <div className="ban">🗺 你們可使用一次手機地圖「點對點交通搜尋」（×{s.mine.pass}）</div>}
          {!gm && s.mine.tf && <div className="ban">↪ 你們下一次乘車的「車資×10」怒鬼值由對方承擔</div>}
          {!gm && s.mine.forceExit && <div className="ban bad">⚠️ 對方使用功能卡：必須在下一站落車（乘港鐵須出閘）</div>}
          {s.final && <div className="ban">🏁 最終地點已公布！{gm ? `Team ${s.lead} 領先` : s.lead === me ? '你們領先：每 4 秒 +1' : '你們落後：每 9 秒 +1，可使用一次免費功能卡，並可向 GM 取得對方實時定位'}</div>}
          {!gm && s.peek && <div className="ban">👁 對方實時定位 10 分鐘內有效（至 {hm(s.peek.until)}）<br />{s.peek.rides.length ? s.peek.rides.map((r: any, i: number) => <div key={i}>{hm(r.ts)} · {r.route || '（未填路線）'} · ${r.fare}</div>) : '暫無車程紀錄'}</div>}
          {gm ? (['A', 'B'] as const).map((t) => { const x = s.teams[t]; return <Gauge key={t} title={`Team ${t}`} sim={s.sim[t]} sub={`地點 ${x.arr.length}/5 ｜ 詛咒 ${x.deb.join(',') || '-'} ｜ 功能卡 ${x.cards.join('/')} ｜ 免費×${x.free}${x.forceExit ? ' ｜ 被迫下車' : ''}${x.shield ? ' ｜ 🛡封印中' : ''}`} />; })
            : <><Gauge title={`Team ${me}（你們）`} sim={s.sim.me} sub={`地點 ${s.mine.arr.length}/5`} /><Gauge title={`Team ${opp}`} sim={s.sim.opp} sub={`地點 ${s.oppArr}/5`} /></>}
        </>
      )}

      {tab === '地點' && !gm && (
        <>
          {s.locs.map((l: any, i: number) => (
            <div key={i} className="card">
              <h3>地點 {i + 1} {l.arrived && '✅'} <small>目前：{STAGE[l.st]}</small></h3>
              <div className="row">
                {l.st < 4 && (l.lock ? <span className="hint">🔒 解鎖按鈕鎖定至 {hm(l.lock)}</span> : <button disabled={!s.run} onClick={() => confirm(`解鎖地點 ${i + 1} 的「${STAGE[l.st + 1]}」？怒鬼值 +${UNLOCK}`) && send({ type: 'unlock', loc: i })}>降低難度（+{UNLOCK}）</button>)}
                {(l.link ? <a className="btn" href={l.link} target="_blank" rel="noreferrer">🌍 開啟 GeoGuessr（{STAGE[l.st]}）</a> : <span className="hint">（連結未設定）</span>)}
              </div>
            </div>
          ))}
          {s.final && <div className="card"><h3>🏁 最終地點</h3>{s.finalLink ? <a className="btn" href={s.finalLink} target="_blank" rel="noreferrer">🌍 開啟 GeoGuessr</a> : <span className="hint">（連結未設定）</span>}</div>}
        </>
      )}

      {tab === '任務' && !gm && (
        <>
          {TASKS.map((t, i) => { const d = s.mine.done.includes(i); return (
            <div key={i} className="card"><h3>{t.n} <small>怒鬼值 −{t.v ? '（依公式）' : t.r}</small></h3><p>{t.d}</p>
              <button disabled={d || !s.run} onClick={() => { if (t.v) { const x = prompt('秤重結果 x（150 最理想）'); if (x !== null && x.trim() !== '' && !isNaN(+x)) send({ type: 'task', id: i, x: +x }); } else if (confirm('確認已完成？（信用！）')) send({ type: 'task', id: i }); }}>{d ? '已完成' : '完成任務'}</button></div>); })}
          {s.mine.hid.map((n: string, i: number) => <div key={i} className="ban note">🔮 你們達成了隱藏任務：{n}</div>)}
        </>
      )}

      {tab === '功能卡' && !gm && (
        <>
          {!s.open && <div className="ban">任意隊伍抵達第一個地點後開放購買</div>}
          {s.mine.free > 0 && <div className="ban">🎁 你們有 {s.mine.free} 次免費功能卡機會（WhatsApp GM 使用）</div>}
          {CARDS.map((c, i) => (
            <div key={i} className="card" style={c.sp && !s.special ? { display: 'none' } : undefined}><h3>{i < 20 ? i + 1 : 'S' + (i - 19)} {c.n} <small>{c.sp ? '怒鬼值上限 −200' : '怒鬼值 +' + c.c}｜持有 ×{s.mine.cards[i]}</small></h3><p>{c.d}</p>
              <button disabled={!s.open} onClick={() => confirm(`購買「${c.n}」？${c.sp ? '怒鬼值爆滿上限 −200（永久）' : '怒鬼值 +' + c.c}`) && send({ type: 'buy', id: i })}>購買</button></div>))}
          <p className="hint">使用功能卡：請 WhatsApp GM</p>
        </>
      )}

      {tab === '詛咒' && !gm && (
        <>
          {!s.mine.deb.length && <div className="ban">每抵達一個地點會抽取一個詛咒，且不能解除</div>}
          {s.mine.deb.map((d: any) => <div key={d.id} className="card curse"><h3>💀 詛咒 #{d.id}</h3><p>{d.t}</p></div>)}
        </>
      )}

      {tab === '紀錄' && <ul className="log">{[...s.log].reverse().map((e: any, i: number) => <li key={i}><time>{hm(e.ts)}</time> {e.vis !== 'all' && e.vis !== 'gm' && gm ? `[${e.vis}] ` : ''}{e.vis === 'gm' ? '[GM] ' : ''}{e.s}</li>)}{!s.log.length && <li>暫無紀錄</li>}</ul>}

      {tab === '連結' && gm && (
        <div className="gmp">
          <p className="hint">貼上每個地點、每個階段（0–4）的 GeoGuessr challenge 連結，以及最終地點的連結（必須以 https:// 開頭），按「儲存」。玩家只會看到自己目前階段的連結，升級階段後才會看到下一條。</p>
          {[...s.locs, '最終地點（公布後才顯示給玩家）'].map((n: string, i: number) => (
            <div key={i} className="card">
              <h3>{i < 5 ? `地點 ${i + 1}` : '🏁'} <small>{n}</small></h3>
              {(i < 5 ? [0, 1, 2, 3, 4] : [0]).map((st) => {
                const k = `${i}-${st}`, saved = s.links[k] || '', val = lk[k] ?? saved;
                return (
                  <div key={k} className="row">
                    <b style={{ width: 70 }}>{i < 5 ? STAGE[st] : '連結'}</b>
                    <input style={{ flex: 1 }} placeholder="https://www.geoguessr.com/challenge/…" value={val} onChange={(e) => setLk({ ...lk, [k]: e.target.value })} />
                    <button onClick={() => send({ type: 'setlink', loc: i, stage: st, url: val })}>儲存</button>
                    <span>{saved && saved === val ? '✓' : ''}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {tab === 'GM' && gm && (
        <div className="gmp">
          <div className="row">{(['A', 'B'] as const).map((t) => <button key={t} className={gt === t ? 'on' : ''} onClick={() => setGt(t)}>Team {t}</button>)}
            {!s.run && !s.over && <button className="go" onClick={() => send({ type: 'start' })}>▶ 遊戲開始</button>}</div>
          <h4>抵達地點（自動抽詛咒）</h4>
          <div className="row">{s.locs.map((n: string, i: number) => <button key={i} disabled={T.arr.includes(i)} onClick={() => send({ type: 'arrive', team: gt, loc: i })}>{i + 1}</button>)}
            <button onClick={() => confirm(`Team ${gt} 抵達最終地點（勝出）？`) && send({ type: 'win', team: gt })}>🏆 最終地點</button></div>
          <p className="hint">{s.locs.map((n: string, i: number) => `${i + 1}.${n}`).join('｜')}</p>
          <h4>乘車記錄</h4>
          <div className="row"><input placeholder="車資 $" inputMode="decimal" value={f.fare} onChange={(e) => num('fare', e.target.value)} /><input placeholder="路線／站點" value={f.route} onChange={(e) => num('route', e.target.value)} /></div>
          <div className="row"><label><input type="checkbox" checked={f.mtr} onChange={(e) => num('mtr', e.target.checked)} /> 港鐵</label><label><input type="checkbox" checked={f.fast} onChange={(e) => num('fast', e.target.checked)} /> ≥70km/h</label>
            <label>轉車站 <input className="n" inputMode="numeric" value={f.ic} onChange={(e) => num('ic', e.target.value)} /></label>
            <button onClick={() => { send({ type: 'ride', team: gt, ...f }); setF({ fare: '', route: '', mtr: false, ic: '0', fast: false }); }}>記錄</button></div>
          <h4>使用功能卡</h4>
          <div className="row"><label><input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} /> 免費機會（×{T.free}）</label></div>
          <div className="row"><label>指定地點 <select value={ul} onChange={(e) => setUl(+e.target.value)}>{[0, 1, 2, 3, 4].map((i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>
            <label>轉移詛咒 <select value={ud} onChange={(e) => setUd(+e.target.value)}><option value={0}>-</option>{T.deb.map((d: number) => <option key={d} value={d}>#{d}</option>)}</select></label></div>
          <div className="row">{CARDS.map((c, i) => (c.sp && !s.special ? null : <button key={i} title={c.d} onClick={() => send({ type: 'use', team: gt, id: i, free, loc: ul, deb: ud })}>{i < 20 ? i + 1 : 'S' + (i - 19)} {c.n} ×{T.cards[i]}</button>))}</div>
          <div className="row">{T.forceExit && <button onClick={() => send({ type: 'forceclear', team: gt })}>解除被迫下車</button>}{T.pass > 0 && <button onClick={() => send({ type: 'passuse', team: gt })}>地圖許可 ×{T.pass} 用掉</button>}
            {T.fx.some((f: any) => f.k === 'store') && <><button onClick={() => send({ type: 'storeok', team: gt })}>便利店 ✓</button><button onClick={() => send({ type: 'storefail', team: gt })}>便利店 ✗（+300）</button></>}</div>
          <p className="hint">生效中：{T.fx.filter((f: any) => f.until > Date.now() + OFF).map((f: any) => `${f.k}${f.loc != null ? '@' + (f.loc + 1) : ''}${f.d ? '(' + f.d + ')' : ''} 至${hm(f.until)}`).join('；') || '無'}{T.tf ? '；嫁禍待用' : ''}{T.s2 ? '；兩蚊兩折' : ''}</p>
          <h4>隱藏任務（被動觸發）</h4>
          <div className="row">{s.hidden.map((n: string, i: number) => <button key={i} disabled={T.hid.includes(i)} onClick={() => send({ type: 'hidden', team: gt, id: i })}>{n}</button>)}</div>
          <h4>手動調整（不套用詛咒）</h4>
          <div className="row"><input placeholder="數值" inputMode="decimal" value={adj} onChange={(e) => setAdj(e.target.value)} />
            <button onClick={() => { send({ type: 'adjust', team: gt, delta: Number(adj) }); setAdj(''); }}>＋</button>
            <button onClick={() => { send({ type: 'adjust', team: gt, delta: -Number(adj) }); setAdj(''); }}>－</button>
            <button onClick={() => { send({ type: 'setv', team: gt, value: Number(adj) }); setAdj(''); }}>設為</button></div>
          <h4>全局</h4>
          <div className="row"><input placeholder="公告／特殊任務" value={say} onChange={(e) => setSay(e.target.value)} /><button onClick={() => { send({ type: 'note', text: say }); setSay(''); }}>發布</button></div>
          <div className="row"><button onClick={() => send({ type: 'lunchdraw' })}>午餐：抽目標金額</button>{s.lunch && <b>${s.lunch}</b>}<button onClick={() => send({ type: 'lunchwin', winner: 'A' })}>A 最接近</button><button onClick={() => send({ type: 'lunchwin', winner: 'B' })}>B 最接近</button></div>
          <div className="row"><select value={fm} onChange={(e) => setFm(e.target.value)}><option value="reset">落後隊伍歸零</option><option value="half">落後隊伍減半</option></select>
            <button disabled={!s.first5 || s.final} onClick={() => send({ type: 'final', mode: fm })}>🏁 公布最終地點{s.first5 ? `（Team ${s.first5} 領先）` : '（未有人到第5點）'}</button></div>
          <div className="row"><button onClick={() => send({ type: 'undo' })}>↩ 復原</button><button onClick={() => confirm('重設整個遊戲？') && send({ type: 'reset' })}>重設</button></div>
        </div>
      )}
      {footer}
    </main>
  );
}
