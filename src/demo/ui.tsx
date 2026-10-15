import { useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { PencilLine, ShieldCheck, Sparkles } from 'lucide-react';
import type { TeamInfo } from './scenarios';

/** SCRIBE QUEST, with the room code chip when there is a room. */
export function Brand({ room }: { room?: string }) {
  return (
    <div className="dm-brand">
      <span className="dm-brand-logo">SCRIBE <b>QUEST</b></span>
      {room && <span className="dm-room">ROOM <b>{room.toUpperCase()}</b></span>}
    </div>
  );
}

/** A team label in the team's game colour. */
export function TeamTag({ team }: { team: TeamInfo }) {
  return <span className={`dm-tag dm-tag--${team.mode}`}><ModeIcon mode={team.mode} /> {team.label}</span>;
}

export function ModeIcon({ mode }: { mode: TeamInfo['mode'] }) {
  if (mode === 'manual') return <PencilLine size="1em" />;
  if (mode === 'ai') return <Sparkles size="1em" />;
  return <ShieldCheck size="1em" />;
}

/** A QR code drawn as crisp SVG squares. */
export function QrCode({ text }: { text: string }) {
  const cells = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const dark: Array<[number, number]> = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) dark.push([c, r]);
    }
    return { n, dark };
  }, [text]);
  const pad = 2;
  const size = cells.n + pad * 2;
  return (
    <svg className="dm-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`QR code for ${text}`} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#ffffff" />
      {cells.dark.map(([x, y]) => <rect key={`${x}-${y}`} x={x + pad} y={y + pad} width="1" height="1" fill="#0f172a" />)}
    </svg>
  );
}
