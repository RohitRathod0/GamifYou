import React from 'react';

export interface SplitFeatureSectionProps {
  eyebrow?: string;
  headline: string;
  body: string;
  cardContent: React.ReactNode;
  reversed?: boolean;
  cardGradient?: string;
  id?: string;
}

export function SplitFeatureSection({
  eyebrow, headline, body, cardContent, reversed = false, cardGradient, id,
}: SplitFeatureSectionProps) {
  const textCol = (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {eyebrow && (
        <p style={{
          fontSize: 13, fontWeight: 600, color: '#6b7280',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16,
        }}>
          {eyebrow}
        </p>
      )}
      <h2 style={{
        fontSize: 'clamp(32px,4vw,48px)', fontWeight: 800, color: '#111111',
        letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 20,
      }}>
        {headline}
      </h2>
      <p style={{ fontSize: 17, color: '#6b7280', lineHeight: 1.65 }}>
        {body}
      </p>
    </div>
  );

  const cardCol = (
    <div style={{
      borderRadius: 24, overflow: 'hidden',
      aspectRatio: '4/3', position: 'relative',
      background: cardGradient ?? 'linear-gradient(135deg, rgba(209,250,229,0.6) 0%, rgba(186,230,253,0.6) 50%, rgba(254,215,170,0.4) 100%)',
      border: '1px solid rgba(255,255,255,0.8)',
      boxShadow: '0 16px 64px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.8)',
    }}>
      <div style={{ position: 'absolute', inset: 0, padding: 32, overflow: 'hidden' }}>
        {cardContent}
      </div>
    </div>
  );

  return (
    <section id={id} style={{ padding: 'clamp(72px,8vw,120px) 0', background: '#ffffff' }}>
      <div style={{
        maxWidth: 1280, margin: '0 auto', padding: '0 clamp(16px,4vw,48px)',
        display: 'grid',
        gridTemplateColumns: reversed ? '3fr 2fr' : '2fr 3fr',
        gap: 'clamp(40px,6vw,80px)',
        alignItems: 'center',
      }}>
        {reversed ? (
          <>
            {cardCol}
            {textCol}
          </>
        ) : (
          <>
            {textCol}
            {cardCol}
          </>
        )}
      </div>
      <style>{`
        @media (max-width: 768px) {
          #${id ?? 'split-section'} > div {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
