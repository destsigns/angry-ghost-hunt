// SERVER-ONLY secrets (never imported by the browser): addresses, GeoGuessr links, debuffs, hidden tasks.
export const DEBUFFS = [
  '港鐵車資將增加兩倍怒鬼值（與轉車站加值分開計算）',
  '若陸路交通工具途經時速>=70的道路，需要額外 +100 怒鬼值（與轉車站加值分開計算）',
  '往後所有怒鬼值（時間增減除外）加值×1.2、減值×0.8（四捨五入）',
  '怒鬼值低於300時，數值上升速度×1.5',
  '發動功能卡時需額外 +50 怒鬼值',
  '隱藏任務改為 +（|原本數值|×0.5）',
  '需要負擔對方隊伍20%車資增加的怒鬼值',
  '每一個途經之轉車站（港鐵/九巴 xxx轉車站）怒鬼值 +50（與車資結算同時計算）',
  '對方隊伍將享受我方隊伍以任何途徑取得的20%怒鬼值減值',
  '怒鬼值爆滿由900改為800、放行條件由700改為600',
];
// links: optional defaults only. Normally enter the GeoGuessr links on the GM page's 「連結」 tab (saved in the database, no redeploy needed).
const L = { 2: '', 3: '', 4: '' } as Record<number, string>;
export const LOCS = [
  { name: '西營盤社區綜合大樓 - 高街鬼屋（高街2號）', links: { ...L } },
  { name: '南固臺（灣仔船街55號）', links: { ...L } },
  { name: '北角七姊妹道208號', links: { ...L } },
  { name: '大埔滘花園（松仔園）大埔公路－大埔滘段', links: { ...L } },
  { name: '屏山達德學校（屏山南北路）', links: { ...L } },
];
export const HIDDEN = [{ n: '（示範隱藏任務）', r: 100 }]; // TODO(GM)
