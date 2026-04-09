import { useNavigate } from 'react-router-dom';

function SparkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
      <path d="M11 2L12.5 9.5L20 11L12.5 12.5L11 20L9.5 12.5L2 11L9.5 9.5L11 2Z" fill="#06b6d4" />
    </svg>
  );
}

interface FooterLinkCol {
  title: string;
  links: string[];
}

const LINK_COLS: FooterLinkCol[] = [
  { title: 'Games', links: ['Chess', 'Air Hockey', 'Scribble Draw', 'Balloon Pop', 'Face Puzzle'] },
  { title: 'Platform', links: ['Public Rooms', 'Create Room', 'Virtual Background', 'Voice Control'] },
  { title: 'Project', links: ['GitHub', 'Architecture', 'API Docs', 'Contribute'] },
];

export function Footer() {
  const navigate = useNavigate();

  const linkStyle: React.CSSProperties = {
    fontSize: 14, color: 'rgba(255,255,255,0.5)', display: 'block',
    padding: '4px 0', cursor: 'pointer', transition: 'color 0.15s',
    background: 'none', border: 'none', textAlign: 'left', fontFamily: 'inherit',
  };

  return (
    <footer style={{ background: '#111111', color: 'rgba(255,255,255,0.5)', padding: '64px 0 32px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 clamp(16px,4vw,48px)' }}>
        {/* Top row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 48,
          marginBottom: 64,
        }}>
          {/* Brand col */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <SparkIcon />
              <span style={{ fontWeight: 600, fontSize: 16, color: '#fff' }}>GamifYou</span>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(255,255,255,0.4)', maxWidth: 240 }}>
              Gesture-powered multiplayer gaming — no controllers needed.
            </p>
          </div>

          {/* Link columns */}
          {LINK_COLS.map(col => (
            <div key={col.title}>
              <p style={{
                fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.08em', color: 'rgba(255,255,255,0.3)', marginBottom: 16,
              }}>
                {col.title}
              </p>
              {col.links.map(lnk => (
                <button
                  key={lnk}
                  style={linkStyle}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
                  onClick={() => {
                    if (lnk === 'Public Rooms') navigate('/public-rooms');
                    else if (lnk === 'Create Room') navigate('/lobby');
                  }}
                >
                  {lnk}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Bottom row */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          paddingTop: 32,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
            © 2025 GamifYou. Built with ❤️ and hand gestures.
          </p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)' }}>
            MediaPipe · FastAPI · Redis · WebRTC
          </p>
        </div>
      </div>
    </footer>
  );
}
