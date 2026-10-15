import { useEffect, useState } from 'react';
import { Player } from './flow/Player';
import { Host } from './flow/Host';

// /?room=4821          a student's phone: join, Games 1 and 2, then Scribe Quest
// /#board              the projector: makes a new 4-digit room, then runs the flow
// /?room=4821#board    the projector for that room (after a reload)
// The room keeps one class's players and results apart from another's.
function roomFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get('room')?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) || null;
}

function newRoom(): string {
  const code = String(1000 + Math.floor(Math.random() * 9000));
  const url = new URL(window.location.href);
  url.searchParams.set('room', code);
  window.history.replaceState(null, '', url);
  return code;
}

export function DemoApp() {
  const [hash, setHash] = useState(() => window.location.hash);
  const [fresh] = useState(() => !roomFromUrl() && window.location.hash === '#board');
  const [room] = useState(() => roomFromUrl() ?? (window.location.hash === '#board' ? newRoom() : null));

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (hash === '#board') return <Host room={room ?? newRoom()} fresh={fresh} />;
  return <Player room={room} />;
}
