import { useState, useEffect, useCallback, useRef } from 'react';
import { roomAPI, RoomSummary } from '@/utils/api';
import { ParticleCanvas } from '@/components/ui/ParticleCanvas';
import { Navbar } from '@/components/ui/Navbar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PublicLobbyProps {
  onJoinRoom: (roomCode: string, username: string, playerId: string) => void;
  onCreateRoom: (isPublic: boolean) => void;
  onBack: () => void;
}

const GAME_EMOJIS: Record<string, string> = {
  air_hockey: '🏒', chess: '♟️', balloon_pop: '🎈', scribble: '✏️', face_puzzle: '🧩',
};
const REFRESH_INTERVAL_MS = 10_000;

const AVATAR_COLORS = ['#4285f4','#ea4335','#fbbc04','#9333ea','#06b6d4','#34a853'];

function codeToColor(code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function formatAge(iso: string | null): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function capColor(count: number, max: number): string {
  const r = count / max;
  if (r >= 0.8) return '#f59e0b';
  if (r >= 0.5) return '#06b6d4';
  return '#22c55e';
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      background: '#ffffff', borderRadius: 20, border: '1px solid rgba(0,0,0,0.08)', padding: 24, minHeight: 200,
      overflow: 'hidden', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(90deg,#f3f4f6 25%,#e5e7eb 50%,#f3f4f6 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
      }} />
    </div>
  );
}

// ── Room Card ─────────────────────────────────────────────────────────────────

interface RoomCardProps {
  room: RoomSummary;
  username: string;
  joining: string | null;
  onJoin: (code: string) => void;
  isNew: boolean;
}

function RoomCard({ room, username, joining, onJoin, isNew }: RoomCardProps) {
  const [hovered, setHovered] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const isJoining = joining === room.room_code;
  const isDisabled = !username.trim() || joining !== null;
  const fillPct = (room.player_count / room.max_players) * 100;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#ffffff', borderRadius: 20, padding: 24,
        border: `1px solid ${hovered ? 'rgba(6,182,212,0.3)' : 'rgba(0,0,0,0.08)'}`,
        boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.08)' : '0 1px 4px rgba(0,0,0,0.04)',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        transition: 'all 0.2s ease',
        animation: isNew ? 'fade-in-up 0.4s ease both' : undefined,
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: codeToColor(room.room_code),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 18, color: '#fff', flexShrink: 0,
          }}>
            {room.host_username[0]?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#111111', lineHeight: 1.2 }}>{room.host_username}</p>
            <p style={{ fontSize: 12, color: '#9ca3af' }}>{formatAge(room.created_at)}</p>
          </div>
        </div>
        <span style={{
          background: '#dcfce7', color: '#15803d',
          borderRadius: 100, padding: '3px 10px', fontSize: 11, fontWeight: 600,
        }}>
          🟢 Open
        </span>
      </div>

      {/* Game pill */}
      <div style={{ marginBottom: 16 }}>
        {room.current_game ? (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#f3f4f6', color: '#374151',
            borderRadius: 100, padding: '6px 14px', fontSize: 13, fontWeight: 500,
          }}>
            {GAME_EMOJIS[room.current_game] ?? '🎮'} {room.current_game.replace('_', ' ')}
          </span>
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#f9fafb', color: '#9ca3af',
            borderRadius: 100, padding: '6px 14px', fontSize: 13, fontStyle: 'italic',
          }}>
            ⏳ Choosing game
          </span>
        )}
      </div>

      {/* Capacity bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>Players</span>
          <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>
            {room.player_count} / {room.max_players}
          </span>
        </div>
        <div style={{ height: 4, background: '#f3f4f6', borderRadius: 100, overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${fillPct}%`, borderRadius: 100,
            background: capColor(room.player_count, room.max_players),
            transition: 'width 0.4s ease',
          }} />
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: 'monospace', fontSize: 12, color: '#9ca3af',
          background: '#f9fafb', padding: '4px 10px', borderRadius: 6,
        }}>
          {room.room_code}
        </span>

        <div
          style={{ position: 'relative' }}
          onMouseEnter={() => !username.trim() && setTooltipVisible(true)}
          onMouseLeave={() => setTooltipVisible(false)}
        >
          {tooltipVisible && !username.trim() && (
            <div style={{
              position: 'absolute', bottom: '110%', right: 0,
              background: '#111111', color: '#fff', fontSize: 12,
              padding: '6px 12px', borderRadius: 8, whiteSpace: 'nowrap',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 10,
            }}>
              Enter your name above first ☝️
            </div>
          )}
          <button
            id={`join-${room.room_code}`}
            onClick={() => onJoin(room.room_code)}
            disabled={isDisabled}
            style={{
              background: isDisabled ? '#f3f4f6' : '#111111',
              color: isDisabled ? '#9ca3af' : '#ffffff',
              borderRadius: 100, padding: '10px 24px',
              fontSize: 14, fontWeight: 600, border: 'none',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s', minHeight: 44, minWidth: 100,
            }}
            onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.background = '#374151'; }}
            onMouseLeave={e => { if (!isDisabled) e.currentTarget.style.background = '#111111'; }}
          >
            {isJoining ? '⏳' : 'Join →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function PublicLobby({ onJoinRoom, onCreateRoom, onBack }: PublicLobbyProps) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [username, setUsername] = useState(() => sessionStorage.getItem('gesturehub_username') ?? '');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsSince, setSecondsSince] = useState(0);
  const prevCodes = useRef<Set<string>>(new Set());
  const [newCodes, setNewCodes] = useState<Set<string>>(new Set());

  // ── Data fetching (preserve existing logic) ────────────────────────────────

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await roomAPI.getPublicRooms();
      setRooms(data);
      const incoming = new Set(data.map(r => r.room_code));
      setNewCodes(new Set([...incoming].filter(c => !prevCodes.current.has(c))));
      prevCodes.current = incoming;
      setSecondsSince(0);
    } catch {
      setError('Could not load public rooms — check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRooms(); }, [fetchRooms]);
  useEffect(() => {
    const id = setInterval(fetchRooms, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchRooms]);
  useEffect(() => {
    const t = setInterval(() => setSecondsSince(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const handleUsernameChange = (v: string) => {
    setUsername(v);
    sessionStorage.setItem('gesturehub_username', v);
  };

  // ── Join handler (preserve existing logic) ─────────────────────────────────

  const handleJoin = async (roomCode: string) => {
    if (!username.trim()) { setError('Enter your name first'); return; }
    setJoining(roomCode); setError(null);
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_code: roomCode, username: username.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(res.status === 409 ? 'Room just filled up — try another!' : (err.detail ?? 'Could not join room'));
        await fetchRooms();
        return;
      }
      const room = await res.json();
      const myPlayer = room.players.find((p: { username: string; player_id: string }) => p.username === username.trim());
      onJoinRoom(roomCode, username.trim(), myPlayer?.player_id ?? '');
    } catch { setError('Network error — please try again'); }
    finally { setJoining(null); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh', fontFamily: 'inherit' }}>
      <Navbar />

      {/* Dark hero */}
      <div style={{ height: 320, background: '#0a0a0a', position: 'relative', overflow: 'hidden' }}>
        <ParticleCanvas density="high" />
        <div style={{
          position: 'relative', zIndex: 1, height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '0 clamp(16px,4vw,48px)',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.6)', borderRadius: 100, padding: '6px 14px',
            fontSize: 13, marginBottom: 18,
          }}>
            🌐 Live Rooms
          </div>
          <h1 style={{
            fontSize: 'clamp(36px,5vw,60px)', fontWeight: 900, color: '#ffffff',
            letterSpacing: '-0.04em', textAlign: 'center', margin: '0 0 12px',
          }}>
            Find a game
          </h1>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
            Browse open rooms and jump in — no invite needed
          </p>
        </div>
      </div>

      {/* Sticky username bar */}
      <div style={{
        position: 'sticky', top: 64, zIndex: 90,
        background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}>
        <div style={{
          maxWidth: 1280, margin: '0 auto', padding: '14px clamp(16px,4vw,48px)',
          display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <input
            id="lobby-username-bar"
            type="text"
            autoFocus
            value={username}
            onChange={e => handleUsernameChange(e.target.value)}
            placeholder="Your name to join a room…"
            style={{
              flex: 1, minWidth: 200, maxWidth: 360, height: 48,
              borderRadius: 100, border: '1px solid rgba(0,0,0,0.12)',
              padding: '0 20px', fontSize: 15, color: '#111111',
              background: '#ffffff', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s',
              fontFamily: 'inherit',
            }}
            onFocus={e => { e.target.style.borderColor = '#06b6d4'; e.target.style.boxShadow = '0 0 0 3px rgba(6,182,212,0.12)'; }}
            onBlur={e => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none'; }}
          />
          <button
            id="create-public-room-bar"
            onClick={() => onCreateRoom(true)}
            style={{
              background: '#111111', color: '#fff', borderRadius: 100,
              padding: '12px 24px', fontSize: 14, fontWeight: 600, border: 'none',
              cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 48, transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#374151'}
            onMouseLeave={e => e.currentTarget.style.background = '#111111'}
          >
            🌐 Create Public
          </button>
          <button
            id="create-private-room-bar"
            onClick={() => onCreateRoom(false)}
            style={{
              background: 'transparent', color: '#374151', borderRadius: 100,
              padding: '12px 24px', fontSize: 14, fontWeight: 600,
              border: '1px solid rgba(0,0,0,0.12)', cursor: 'pointer',
              whiteSpace: 'nowrap', minHeight: 48, transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.25)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.12)'; }}
          >
            🔒 Create Private
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#9ca3af' }}>
            <span>Updated {secondsSince}s ago</span>
            <button
              id="refresh-rooms"
              onClick={fetchRooms}
              disabled={loading}
              style={{
                background: '#f3f4f6', border: 'none', borderRadius: 8,
                padding: '8px 14px', cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 13, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.2s',
              }}
            >
              <span style={{ display: 'inline-block', animation: loading ? 'spin 0.8s linear infinite' : 'none' }}>↻</span>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '48px clamp(16px,4vw,48px) 80px' }}>

        {/* Error */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12,
            padding: '12px 16px', marginBottom: 24, fontSize: 14, color: '#dc2626',
          }}>
            ⚠️ {error}
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 18 }}>×</button>
          </div>
        )}

        {/* Section header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111111' }}>Open Rooms</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'pulse-dot 2s infinite' }} />
            <span style={{
              background: '#dcfce7', color: '#15803d', borderRadius: 100,
              padding: '4px 12px', fontSize: 12, fontWeight: 600,
            }}>
              {rooms.length} live {rooms.length === 1 ? 'room' : 'rooms'}
            </span>
          </div>
        </div>

        {/* Grid */}
        {loading && rooms.length === 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(300px,100%),1fr))', gap: 20 }}>
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : rooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <p style={{ fontSize: 64, marginBottom: 24 }}>🎮</p>
            <h3 style={{ fontSize: 24, fontWeight: 700, color: '#111111', marginBottom: 12 }}>No rooms open right now</h3>
            <p style={{ fontSize: 16, color: '#6b7280', marginBottom: 32 }}>Create a public room and wait for friends to join!</p>
            <button
              id="empty-create-room"
              onClick={() => onCreateRoom(true)}
              style={{
                background: '#111111', color: '#fff', borderRadius: 100,
                padding: '14px 32px', fontSize: 16, fontWeight: 600, border: 'none', cursor: 'pointer',
              }}
            >
              🌐 Create a Public Room
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(300px,100%),1fr))', gap: 20 }}>
            {rooms.map(room => (
              <RoomCard
                key={room.room_code}
                room={room}
                username={username}
                joining={joining}
                onJoin={handleJoin}
                isNew={newCodes.has(room.room_code)}
              />
            ))}
          </div>
        )}

        {/* Back link */}
        <div style={{ textAlign: 'center', marginTop: 64 }}>
          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14 }}
          >
            ← Back to home
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(0.85)} }
        @keyframes fade-in-up { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
