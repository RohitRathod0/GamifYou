import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Spark logo icon ────────────────────────────────────────────────────────────
function SparkIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M11 2L12.5 9.5L20 11L12.5 12.5L11 20L9.5 12.5L2 11L9.5 9.5L11 2Z" fill="#06b6d4" />
    </svg>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────
export function Navbar() {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { label: 'Lobby',  href: '/lobby' },
    { label: 'Rooms',  href: '/public-rooms' },
    { label: 'About',  href: '#about' },
  ];

  const linkStyle: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 500,
    color: '#374151',
    textDecoration: 'none',
    padding: '8px 12px',
    borderRadius: 8,
    transition: 'all 0.15s',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  };

  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: 'rgba(255,255,255,0.92)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
    }}>
      <div style={{
        maxWidth: 1280,
        margin: '0 auto',
        padding: '0 clamp(16px,4vw,48px)',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <button
          onClick={() => navigate('/lobby')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          <SparkIcon />
          <span style={{ fontWeight: 600, fontSize: 18, color: '#111111', fontFamily: 'inherit' }}>
            GamifYou
          </span>
        </button>

        {/* Desktop nav links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="nav-links-desktop">
          {navLinks.map(link => (
            <button
              key={link.label}
              onClick={() => navigate(link.href)}
              style={linkStyle}
              onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#111'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#374151'; }}
            >
              {link.label}
            </button>
          ))}
        </div>

        {/* CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            id="nav-play-now"
            onClick={() => navigate('/public-rooms')}
            style={{
              background: '#111111', color: '#ffffff',
              borderRadius: 100, padding: '10px 24px',
              fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#374151'; e.currentTarget.style.transform = 'scale(1.02)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#111111'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            Play Now
          </button>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(o => !o)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 8, display: 'none', flexDirection: 'column', gap: 4,
            }}
            className="nav-mobile-toggle"
            aria-label="Menu"
          >
            <span style={{ display: 'block', width: 20, height: 2, background: '#374151', borderRadius: 2 }} />
            <span style={{ display: 'block', width: 20, height: 2, background: '#374151', borderRadius: 2 }} />
            <span style={{ display: 'block', width: 20, height: 2, background: '#374151', borderRadius: 2 }} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div style={{
          borderTop: '1px solid rgba(0,0,0,0.06)', padding: '12px 20px 20px',
          background: 'rgba(255,255,255,0.98)', display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {navLinks.map(link => (
            <button
              key={link.label}
              onClick={() => { navigate(link.href); setMobileOpen(false); }}
              style={{ ...linkStyle, textAlign: 'left', width: '100%', padding: '12px 16px' }}
            >
              {link.label}
            </button>
          ))}
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .nav-links-desktop { display: none !important; }
          .nav-mobile-toggle { display: flex !important; }
        }
      `}</style>
    </nav>
  );
}
