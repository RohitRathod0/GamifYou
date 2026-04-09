interface Stat { number: string; suffix: string; label: string; }

const STATS: Stat[] = [
  { number: '60', suffix: '', label: 'FPS hand tracking' },
  { number: '5',  suffix: '+', label: 'gesture-powered games' },
  { number: '21', suffix: '', label: 'landmarks tracked' },
  { number: '0',  suffix: '', label: 'controllers needed' },
];

export function StatsRow() {
  return (
    <section style={{
      padding: '80px 0',
      background: '#f8f9fa',
      borderTop: '1px solid rgba(0,0,0,0.06)',
      borderBottom: '1px solid rgba(0,0,0,0.06)',
    }}>
      <div style={{
        maxWidth: 1280, margin: '0 auto', padding: '0 clamp(16px,4vw,48px)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 48,
        textAlign: 'center',
      }}>
        {STATS.map(s => (
          <div key={s.label}>
            <p style={{
              fontSize: 'clamp(40px,6vw,64px)', fontWeight: 900, color: '#111111',
              letterSpacing: '-0.04em', lineHeight: 1,
            }}>
              {s.number}{s.suffix}
            </p>
            <p style={{ fontSize: 14, color: '#6b7280', marginTop: 8, fontWeight: 500 }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
