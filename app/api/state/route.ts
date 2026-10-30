import { NextResponse } from 'next/server';
import { act, view } from '../../../lib/game';

export const dynamic = 'force-dynamic';
const teamPin = (t: string) => (t === 'A' ? process.env.TEAM_A_PIN : t === 'B' ? process.env.TEAM_B_PIN : undefined);
function who(req: Request, team: string) {
  if (process.env.GM_PIN && req.headers.get('x-gm-pin') === process.env.GM_PIN) return 'GM';
  const p = teamPin(team);
  return p && req.headers.get('x-team-pin') === p ? team : null;
}

export async function GET(req: Request) {
  const w = who(req, new URL(req.url).searchParams.get('team') || '');
  if (!w) return NextResponse.json({ error: 'bad pin' }, { status: 401 });
  const { s, now } = await act(null);
  return NextResponse.json(view(s, w, now));
}

export async function POST(req: Request) {
  const a = await req.json();
  const w = who(req, a.team || '');
  if (!w) return NextResponse.json({ error: 'bad pin' }, { status: 401 });
  if (w !== 'GM' && !['unlock', 'task', 'buy'].includes(a.type)) return NextResponse.json({ error: 'GM only' }, { status: 403 });
  try {
    const { s, now } = await act(a);
    return NextResponse.json(view(s, w, now));
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'error' }, { status: 400 });
  }
}
