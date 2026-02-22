import React, { useState, useRef } from 'react';
import { BackgroundConfig, StyleFilter } from './types';
import AIBackgroundGenerator from './AIBackgroundGenerator';
import {
    BACKGROUND_IMAGES,
    GRADIENT_PRESETS,
    PRESET_COLORS,
    STYLE_FILTERS,
} from './backgroundData';

interface Props {
    onSelectBackground: (config: BackgroundConfig) => void;
    currentConfig: BackgroundConfig;
}

type Tab = 'none' | 'blur' | 'image' | 'color' | 'gradient' | 'style' | 'ai_generate';

const TAB_DEFS: { id: Tab; label: string; emoji: string }[] = [
    { id: 'none', label: 'Off', emoji: '🚫' },
    { id: 'blur', label: 'Blur', emoji: '🌫️' },
    { id: 'image', label: 'Images', emoji: '🖼️' },
    { id: 'color', label: 'Color', emoji: '🎨' },
    { id: 'gradient', label: 'Gradient', emoji: '🌈' },
    { id: 'style', label: 'Filters', emoji: '✨' },
    { id: 'ai_generate', label: 'AI Generate', emoji: '🤖' },
];

// ─── Styles ────────────────────────────────────────────────────────────────

const panel: React.CSSProperties = {
    background: 'linear-gradient(160deg, #1e1e2e 0%, #16161d 100%)',
    borderRadius: '16px',
    padding: '20px',
    color: '#fff',
    fontFamily: "'Segoe UI', sans-serif",
    border: '1px solid rgba(255,255,255,0.07)',
    height: '100%',
    boxSizing: 'border-box',
};

const tabBtn = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    background: active
        ? 'linear-gradient(135deg, #7c3aed, #06b6d4)'
        : 'rgba(255,255,255,0.06)',
    color: '#fff',
    border: active ? 'none' : '1px solid rgba(255,255,255,0.1)',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '13px',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s',
    fontWeight: active ? 700 : 400,
});

const applyBtn: React.CSSProperties = {
    padding: '10px 22px',
    background: 'linear-gradient(135deg, #7c3aed, #06b6d4)',
    color: '#fff',
    border: 'none',
    borderRadius: '20px',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: '14px',
    marginTop: '14px',
    width: '100%',
    transition: 'opacity 0.2s',
};

// ─── Component ─────────────────────────────────────────────────────────────

export const BackgroundGallery: React.FC<Props> = ({ onSelectBackground, currentConfig }) => {
    const [activeTab, setActiveTab] = useState<Tab>('none');
    const [blurAmount, setBlurAmount] = useState(12);
    const [customColor, setCustomColor] = useState('#003366');
    const [gradientAngle, setGradientAngle] = useState(135);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isSelected = (type: string, key?: string) => {
        if (currentConfig.type !== type) return false;
        if (key && type === 'image') return currentConfig.imageUrl === key;
        if (key && type === 'color') return currentConfig.color === key;
        if (key && type === 'style') return currentConfig.styleFilter === key;
        return true;
    };

    const cardStyle = (selected: boolean): React.CSSProperties => ({
        cursor: 'pointer',
        borderRadius: '10px',
        overflow: 'hidden',
        border: selected ? '2px solid #06b6d4' : '2px solid transparent',
        boxShadow: selected ? '0 0 0 2px rgba(6,182,212,0.4)' : 'none',
        transition: 'all 0.2s',
        background: '#1a1a2e',
    });

    // Handle custom image upload
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                onSelectBackground({ type: 'image', imageUrl: reader.result });
            }
        };
        reader.readAsDataURL(file);
    };

    return (
        <div style={panel}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, letterSpacing: '0.5px' }}>
                🎨 Background Settings
            </h3>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>
                {TAB_DEFS.map(({ id, label, emoji }) => (
                    <button key={id} style={tabBtn(activeTab === id)} onClick={() => setActiveTab(id)}>
                        {emoji} {label}
                    </button>
                ))}
            </div>

            {/* ── Off ─────────────────────────────────────────────────────────── */}
            {activeTab === 'none' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚫</div>
                    <p style={{ color: '#888', marginBottom: '16px', fontSize: '14px' }}>
                        No background effect applied
                    </p>
                    <button style={applyBtn} onClick={() => onSelectBackground({ type: 'none' })}>
                        Disable Effect
                    </button>
                </div>
            )}

            {/* ── Blur ────────────────────────────────────────────────────────── */}
            {activeTab === 'blur' && (
                <div>
                    <div style={{ marginBottom: '10px', fontSize: '14px', color: '#aaa' }}>
                        Portrait Mode — blur the background while keeping you sharp
                    </div>
                    <label style={{ fontSize: '13px', color: '#ccc' }}>
                        Blur Intensity: <strong style={{ color: '#06b6d4' }}>{blurAmount}px</strong>
                    </label>
                    <input
                        type="range" min={4} max={30} value={blurAmount}
                        onChange={e => setBlurAmount(+e.target.value)}
                        style={{ width: '100%', marginTop: '8px', accentColor: '#06b6d4' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#666', marginBottom: '10px' }}>
                        <span>Subtle</span><span>Heavy</span>
                    </div>
                    {/* Quick presets */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '4px' }}>
                        {[5, 10, 15, 20, 25].map(v => (
                            <button key={v}
                                onClick={() => { setBlurAmount(v); onSelectBackground({ type: 'blur', blurAmount: v }); }}
                                style={{
                                    flex: 1, padding: '6px 0', fontSize: '12px',
                                    background: blurAmount === v ? 'rgba(6,182,212,0.3)' : 'rgba(255,255,255,0.06)',
                                    border: blurAmount === v ? '1px solid #06b6d4' : '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '6px', color: '#fff', cursor: 'pointer',
                                }}>
                                {v}px
                            </button>
                        ))}
                    </div>
                    <button style={applyBtn} onClick={() => onSelectBackground({ type: 'blur', blurAmount })}>
                        Apply Blur Background
                    </button>
                </div>
            )}

            {/* ── Images ──────────────────────────────────────────────────────── */}
            {activeTab === 'image' && (
                <div>
                    {/* Custom upload */}
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            border: '2px dashed rgba(6,182,212,0.5)', borderRadius: '10px',
                            padding: '14px', textAlign: 'center', cursor: 'pointer',
                            marginBottom: '14px', color: '#06b6d4', fontSize: '13px',
                            transition: 'background 0.2s',
                        }}
                    >
                        📁 Upload your own image
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />

                    {/* Category filter */}
                    <p style={{ fontSize: '12px', color: '#888', margin: '0 0 10px' }}>Preset backgrounds:</p>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '8px',
                        maxHeight: '340px',
                        overflowY: 'auto',
                        paddingRight: '4px',
                    }}>
                        {BACKGROUND_IMAGES.map(bg => (
                            <div
                                key={bg.id}
                                style={cardStyle(isSelected('image', bg.url))}
                                onClick={() => onSelectBackground({ type: 'image', imageUrl: bg.url })}
                            >
                                <img src={bg.thumbnail} alt={bg.name}
                                    style={{ width: '100%', height: '72px', objectFit: 'cover', display: 'block' }} />
                                <div style={{ padding: '5px 8px', fontSize: '11px', color: '#ccc', textAlign: 'center' }}>
                                    {bg.name}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Solid Color ─────────────────────────────────────────────────── */}
            {activeTab === 'color' && (
                <div>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '8px',
                        marginBottom: '16px',
                    }}>
                        {PRESET_COLORS.map(c => (
                            <div
                                key={c.value}
                                style={cardStyle(isSelected('color', c.value))}
                                onClick={() => onSelectBackground({ type: 'color', color: c.value })}
                            >
                                <div style={{ width: '100%', height: '52px', background: c.value }} />
                                <div style={{ padding: '5px 6px', fontSize: '11px', color: '#ccc', textAlign: 'center' }}>
                                    {c.name}
                                </div>
                            </div>
                        ))}
                    </div>
                    <label style={{ fontSize: '13px', color: '#ccc', display: 'block', marginBottom: '8px' }}>
                        Custom Color
                    </label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                            type="color" value={customColor}
                            onChange={e => setCustomColor(e.target.value)}
                            style={{ width: '44px', height: '44px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: 'none' }}
                        />
                        <span style={{ color: '#aaa', fontSize: '14px', flex: 1 }}>{customColor}</span>
                        <button
                            style={{ ...applyBtn, width: 'auto', marginTop: 0, padding: '10px 16px' }}
                            onClick={() => onSelectBackground({ type: 'color', color: customColor })}
                        >
                            Apply
                        </button>
                    </div>
                </div>
            )}

            {/* ── Gradient ────────────────────────────────────────────────────── */}
            {activeTab === 'gradient' && (
                <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', marginBottom: '16px' }}>
                        {GRADIENT_PRESETS.map(g => {
                            const cssGrad = `linear-gradient(${gradientAngle}deg, ${g.colors.join(', ')})`;
                            const selected = currentConfig.type === 'gradient' &&
                                JSON.stringify(currentConfig.gradientColors) === JSON.stringify(g.colors);
                            return (
                                <div
                                    key={g.name}
                                    style={cardStyle(selected)}
                                    onClick={() => onSelectBackground({ type: 'gradient', gradientColors: g.colors, gradientAngle })}
                                >
                                    <div style={{ width: '100%', height: '60px', background: cssGrad }} />
                                    <div style={{ padding: '5px 8px', fontSize: '11px', color: '#ccc', textAlign: 'center' }}>
                                        {g.name}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <label style={{ fontSize: '13px', color: '#ccc' }}>
                        Angle: <strong style={{ color: '#06b6d4' }}>{gradientAngle}°</strong>
                    </label>
                    <input
                        type="range" min={0} max={360} value={gradientAngle}
                        onChange={e => setGradientAngle(+e.target.value)}
                        style={{ width: '100%', marginTop: '8px', accentColor: '#06b6d4' }}
                    />
                </div>
            )}

            {/* ── Style Filters ───────────────────────────────────────────────── */}
            {activeTab === 'style' && (
                <div>
                    <p style={{ fontSize: '12px', color: '#888', margin: '0 0 12px' }}>
                        Apply a visual filter effect to your background
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                        {STYLE_FILTERS.map(f => {
                            const selected = isSelected('style', f.id);
                            return (
                                <div
                                    key={f.id}
                                    style={{
                                        ...cardStyle(selected),
                                        padding: '10px 6px',
                                        textAlign: 'center',
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => onSelectBackground({ type: 'style', styleFilter: f.id as StyleFilter })}
                                >
                                    <div style={{ fontSize: '24px', marginBottom: '4px' }}>{f.emoji}</div>
                                    <div style={{ fontSize: '11px', color: '#ccc' }}>{f.name}</div>
                                </div>
                            );
                        })}
                    </div>
                    <p style={{ fontSize: '11px', color: '#555', marginTop: '12px', lineHeight: '1.5' }}>
                        💡 Filters apply CSS effects to the background video layer, keeping your face natural.
                    </p>
                </div>
            )}

            {/* ── AI Generate ─────────────────────────────────────────────────── */}
            {activeTab === 'ai_generate' && (
                <AIBackgroundGenerator
                    onImageGenerated={(url) => {
                        // Reuses the exact same image pipeline already used by the Images tab
                        onSelectBackground({ type: 'image', imageUrl: url });
                    }}
                />
            )}
        </div>
    );
};
