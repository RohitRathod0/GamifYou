import React from 'react';
import { BackgroundConfig } from '@/components/Background/types';
import { BACKGROUND_IMAGES, STYLE_FILTERS } from '@/components/Background/backgroundData';

interface VirtualBgPanelProps {
    bgConfig: BackgroundConfig;
    onChange: (cfg: BackgroundConfig) => void;
    onClose: () => void;
    modelReady: boolean;
}

const QUICK_BG_PRESETS = [
    { label: 'Off', emoji: '🚫', config: { type: 'none' } },
    { label: 'Blur', emoji: '🌫️', config: { type: 'blur', blurAmount: 14 } },
    { label: 'Gradient', emoji: '🌈', config: { type: 'gradient', gradientColors: ['#0f0c29', '#302b63', '#24243e'], gradientAngle: 135 } },
    { label: 'Neon', emoji: '💜', config: { type: 'style', styleFilter: 'neon' } },
] as const;

export const VirtualBgPanel: React.FC<VirtualBgPanelProps> = ({ bgConfig, onChange, onClose, modelReady }) => {

    const isSelected = (configToMatch: any) => {
        if (configToMatch.type !== bgConfig.type) return false;
        if (configToMatch.type === 'image') return bgConfig.imageUrl === configToMatch.imageUrl;
        if (configToMatch.type === 'style') return bgConfig.styleFilter === configToMatch.styleFilter;
        if (configToMatch.type === 'gradient') return bgConfig.gradientColors?.[0] === configToMatch.gradientColors?.[0]; // rough check
        return true;
    };

    const cardStyle = (selected: boolean) => ({
        border: selected ? '2px solid #06b6d4' : '1px solid rgba(255,255,255,0.08)',
        background: selected ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)',
        borderRadius: 10,
        transition: 'all 0.15s ease',
        cursor: 'pointer',
        padding: '10px 4px',
        textAlign: 'center' as const,
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'center',
    });

    const dividerStyle = {
        height: 1,
        background: 'rgba(255,255,255,0.1)',
        margin: '16px 0',
    };

    return (
        <div style={{
            position: 'fixed',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 500,
            width: 520,
            maxWidth: '95vw',
            background: 'linear-gradient(160deg, #1e1e2e, #16161d)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 16,
            padding: 20,
            color: '#ffffff',
            boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(6,182,212,0.2)',
            fontFamily: 'inherit'
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#06b6d4' }}>🎭 Virtual Background</h3>
                <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Loading */}
            {!modelReady && (
                <div style={{ color: '#f59e0b', marginBottom: 12, fontSize: '0.9rem', textAlign: 'center' }}>
                    ⏳ Loading AI model...
                </div>
            )}

            <div style={{ opacity: modelReady ? 1 : 0.5, pointerEvents: modelReady ? 'auto' : 'none' }}>
                {/* Quick Presets */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {QUICK_BG_PRESETS.map((preset) => (
                        <div 
                            key={preset.label}
                            onClick={() => onChange(preset.config as BackgroundConfig)}
                            style={{ ...cardStyle(isSelected(preset.config)), padding: '12px 4px' }}
                            onMouseEnter={e => e.currentTarget.style.background = isSelected(preset.config) ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.08)'}
                            onMouseLeave={e => e.currentTarget.style.background = isSelected(preset.config) ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)'}
                        >
                            <span style={{ fontSize: '1.8rem', marginBottom: 4 }}>{preset.emoji}</span>
                            <span style={{ fontSize: '0.85rem' }}>{preset.label}</span>
                        </div>
                    ))}
                </div>

                {/* Blur Slider */}
                {bgConfig.type === 'blur' && (
                    <div style={{ marginTop: 16, padding: '0 10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginBottom: 8 }}>
                            <span>Blur intensity: <strong style={{color: '#06b6d4'}}>{bgConfig.blurAmount || 14}px</strong></span>
                        </div>
                        <input 
                            type="range" 
                            min="4" 
                            max="30" 
                            value={bgConfig.blurAmount || 14} 
                            onChange={(e) => onChange({ type: 'blur', blurAmount: parseInt(e.target.value) })}
                            style={{ width: '100%', accentColor: '#06b6d4' }}
                        />
                    </div>
                )}

                <div style={dividerStyle} />

                {/* Backgrounds */}
                <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 600 }}>🖼 Backgrounds</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {BACKGROUND_IMAGES.map((img) => (
                        <div 
                            key={img.id}
                            onClick={() => onChange({ type: 'image', imageUrl: img.url })}
                            style={{
                                ...cardStyle(bgConfig.type === 'image' && bgConfig.imageUrl === img.url),
                                padding: 0,
                                height: 75,
                                backgroundImage: `url(${img.thumbnail || img.url})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                        >
                            <div style={{
                                position: 'absolute', bottom: 0, left: 0, right: 0,
                                background: 'rgba(0,0,0,0.6)', padding: '4px',
                                fontSize: '0.75rem', fontWeight: 600
                            }}>
                                {img.name}
                            </div>
                        </div>
                    ))}
                </div>

                <div style={dividerStyle} />

                {/* Style Filters */}
                <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', fontWeight: 600 }}>✨ Filters</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {STYLE_FILTERS.map((filter) => (
                        <div 
                            key={filter.id}
                            onClick={() => onChange({ type: 'style', styleFilter: filter.id })}
                            style={cardStyle(bgConfig.type === 'style' && bgConfig.styleFilter === filter.id)}
                            onMouseEnter={e => e.currentTarget.style.background = (bgConfig.type === 'style' && bgConfig.styleFilter === filter.id) ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.08)'}
                            onMouseLeave={e => e.currentTarget.style.background = (bgConfig.type === 'style' && bgConfig.styleFilter === filter.id) ? 'rgba(6,182,212,0.15)' : 'rgba(255,255,255,0.04)'}
                        >
                            <span style={{ fontSize: '1.5rem', marginBottom: 4 }}>{filter.emoji}</span>
                            <span style={{ fontSize: '0.75rem' }}>{filter.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div style={{ marginTop: 20, textAlign: 'center', fontSize: '0.75rem', color: '#888' }}>
                AI-powered background removal • Runs in your browser
            </div>
        </div>
    );
};
