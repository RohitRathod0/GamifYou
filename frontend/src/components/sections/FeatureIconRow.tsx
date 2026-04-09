const ICONS = [
  { icon: '✋', label: 'Hand Tracking' },
  { icon: '🏒', label: 'Air Hockey' },
  { icon: '♟️', label: 'Chess' },
  { icon: '✏️', label: 'Scribble' },
  { icon: '🎈', label: 'Balloon Pop' },
  { icon: '🧩', label: 'Face Puzzle' },
  { icon: '🎤', label: 'Voice Control' },
  { icon: '👥', label: 'Multiplayer' },
  { icon: '🌐', label: 'WebRTC' },
  { icon: '🤖', label: 'AI Coach' },
  { icon: '🎭', label: 'Virtual BG' },
  { icon: '⚡', label: '60fps' },
];

export function FeatureIconRow() {
  return (
    <div style={{
      borderTop: '1px solid rgba(0,0,0,0.06)',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
      padding: '40px 0',
      overflowX: 'auto',
      msOverflowStyle: 'none',
      scrollbarWidth: 'none',
    }}
      className="hide-scrollbar"
    >
      <div style={{
        display: 'flex',
        gap: 16,
        padding: '0 clamp(16px,4vw,48px)',
        minWidth: 'max-content',
        alignItems: 'center',
      }}>
        {ICONS.map(({ icon, label }) => (
          <div
            key={label}
            title={label}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'default' }}
          >
            <div
              style={{
                width: 72, height: 72,
                borderRadius: '50%',
                background: '#f3f4f6',
                border: '1px solid rgba(0,0,0,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28,
                transition: 'all 0.2s',
                flexShrink: 0,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#e5e7eb'; (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.08)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '#f3f4f6'; (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; }}
            >
              {icon}
            </div>
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, whiteSpace: 'nowrap' }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
