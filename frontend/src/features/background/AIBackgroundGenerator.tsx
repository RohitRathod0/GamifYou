import React, { useState, useEffect } from 'react';
import { generateBackground } from './aiBackgroundService';
import { GenerationStatus, PromptHistory } from './types_ai';

interface Props {
    /** Called when user clicks "Apply as Background" with a resolved image URL */
    onImageGenerated: (url: string) => void;
}

// ── Quick-prompt chips ────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
    { emoji: '🌆', label: 'Cyberpunk City', prompt: 'Cyberpunk city street at night, neon lights, rain reflections' },
    { emoji: '🏝️', label: 'Tropical Beach', prompt: 'Tropical beach at sunset, turquoise water, palm trees' },
    { emoji: '🚀', label: 'Space Station', prompt: 'Interior of a futuristic space station with earth visible through window' },
    { emoji: '🌸', label: 'Japanese Garden', prompt: 'Japanese zen garden with cherry blossoms and koi pond' },
    { emoji: '🏔️', label: 'Mountain Sunrise', prompt: 'Mountain landscape at sunrise with mist and pine forests' },
    { emoji: '🌌', label: 'Galaxy', prompt: 'Deep space galaxy with colorful nebula and star clusters' },
    { emoji: '🏙️', label: 'Modern Office', prompt: 'Modern minimalist office interior with large windows and city view' },
    { emoji: '🌊', label: 'Underwater', prompt: 'Crystal clear underwater scene with coral reef and tropical fish' },
];

const HISTORY_KEY = 'ai_bg_history';
const MAX_HISTORY = 4;

// ── Sub-styles ────────────────────────────────────────────────────────────────
const s = {
    chip: (active: boolean): React.CSSProperties => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '5px 11px',
        background: active ? 'linear-gradient(135deg,#7c3aed,#06b6d4)' : 'rgba(255,255,255,0.07)',
        border: active ? 'none' : '1px solid rgba(255,255,255,0.12)',
        borderRadius: '16px',
        color: '#fff',
        fontSize: '12px',
        cursor: 'pointer',
        transition: 'all 0.18s',
        whiteSpace: 'nowrap',
        fontWeight: active ? 700 : 400,
    }),
    textarea: (): React.CSSProperties => ({
        width: '100%',
        minHeight: '72px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '10px',
        padding: '10px 12px',
        color: '#fff',
        fontSize: '13px',
        resize: 'vertical',
        outline: 'none',
        fontFamily: "'Segoe UI', sans-serif",
        lineHeight: '1.5',
        boxSizing: 'border-box',
    }),
    genBtn: (loading: boolean): React.CSSProperties => ({
        width: '100%',
        padding: '11px',
        background: loading
            ? 'rgba(124,58,237,0.4)'
            : 'linear-gradient(135deg,#7c3aed,#06b6d4)',
        border: 'none',
        borderRadius: '10px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: 700,
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
        marginTop: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
    }),
    applyBtn: (): React.CSSProperties => ({
        flex: 1,
        padding: '9px',
        background: 'linear-gradient(135deg,#7c3aed,#06b6d4)',
        border: 'none',
        borderRadius: '8px',
        color: '#fff',
        fontSize: '13px',
        fontWeight: 700,
        cursor: 'pointer',
    }),
    retryBtn: (): React.CSSProperties => ({
        flex: 1,
        padding: '9px',
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '8px',
        color: '#ccc',
        fontSize: '13px',
        cursor: 'pointer',
    }),
    historyThumb: (selected: boolean): React.CSSProperties => ({
        width: '100%',
        aspectRatio: '16/9',
        objectFit: 'cover',
        borderRadius: '8px',
        cursor: 'pointer',
        border: selected ? '2px solid #06b6d4' : '2px solid transparent',
        boxShadow: selected ? '0 0 0 2px rgba(6,182,212,0.35)' : 'none',
        transition: 'all 0.15s',
    }),
};

// ── Component ─────────────────────────────────────────────────────────────────
const AIBackgroundGenerator: React.FC<Props> = ({ onImageGenerated }) => {
    const [prompt, setPrompt] = useState('');
    const [activeChip, setActiveChip] = useState<string | null>(null);
    const [status, setStatus] = useState<GenerationStatus>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [history, setHistory] = useState<PromptHistory[]>([]);
    const [selectedHist, setSelectedHist] = useState<string | null>(null); // id of selected history item

    // Load history from sessionStorage on mount
    useEffect(() => {
        try {
            const raw = sessionStorage.getItem(HISTORY_KEY);
            if (raw) setHistory(JSON.parse(raw));
        } catch { /* ignore parse errors */ }
    }, []);

    const saveHistory = (entries: PromptHistory[]) => {
        setHistory(entries);
        sessionStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
    };

    const generate = async (customPrompt?: string) => {
        const p = (customPrompt ?? prompt).trim();
        if (!p || status === 'generating') return;

        setStatus('generating');
        setErrorMsg(null);
        setPreviewUrl(null);
        setSelectedHist(null);

        try {
            const url = await generateBackground(p);
            setPreviewUrl(url);
            setStatus('success');

            // Prepend to history, keep last MAX_HISTORY
            const entry: PromptHistory = {
                id: `${Date.now()}`,
                prompt: p,
                imageUrl: url,
                generatedAt: Date.now(),
            };
            const updated = [entry, ...history].slice(0, MAX_HISTORY);
            saveHistory(updated);
        } catch (err: any) {
            setStatus('error');
            setErrorMsg(err?.message ?? 'Generation failed — please try again');
        }
    };

    const handleChipClick = (chip: typeof QUICK_PROMPTS[0]) => {
        setActiveChip(chip.label);
        setPrompt(chip.prompt);
        generate(chip.prompt);  // auto-generate on chip click
    };

    const handleApply = () => {
        if (previewUrl) onImageGenerated(previewUrl);
    };

    const handleHistoryClick = (entry: PromptHistory) => {
        setSelectedHist(entry.id);
        setPreviewUrl(entry.imageUrl);
        setPrompt(entry.prompt);
        setStatus('success');
        onImageGenerated(entry.imageUrl); // apply immediately on history click
    };

    const isGenerating = status === 'generating';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Header */}
            <p style={{ fontSize: '12px', color: '#888', margin: 0, lineHeight: '1.5' }}>
                Describe any scene — AI generates it instantly as your background.
            </p>

            {/* Quick prompt chips */}
            <div>
                <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Quick Prompts
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {QUICK_PROMPTS.map(chip => (
                        <button
                            key={chip.label}
                            style={s.chip(activeChip === chip.label)}
                            onClick={() => handleChipClick(chip)}
                            disabled={isGenerating}
                        >
                            {chip.emoji} {chip.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Custom prompt */}
            <div>
                <p style={{ fontSize: '11px', color: '#666', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Or describe your own
                </p>
                <textarea
                    id="ai-prompt-input"
                    name="ai-prompt-input"
                    value={prompt}
                    onChange={e => { setPrompt(e.target.value); setActiveChip(null); }}
                    placeholder="e.g. Rainy Tokyo street at midnight with neon reflections..."
                    maxLength={200}
                    style={s.textarea()}
                    disabled={isGenerating}
                />
                <div style={{ textAlign: 'right', fontSize: '11px', color: '#555', marginTop: '3px' }}>
                    {prompt.length}/200
                </div>
            </div>

            {/* Generate button */}
            <button
                style={s.genBtn(isGenerating || !prompt.trim())}
                onClick={() => generate()}
                disabled={isGenerating || !prompt.trim()}
            >
                {isGenerating ? (
                    <>
                        <span style={{
                            display: 'inline-block', width: '14px', height: '14px',
                            border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff',
                            borderRadius: '50%', animation: 'spin .8s linear infinite',
                        }} />
                        Generating… (3-8 sec)
                    </>
                ) : '✨ Generate Background'}
            </button>

            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

            {/* Error */}
            {status === 'error' && errorMsg && (
                <div style={{
                    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#fca5a5',
                }}>
                    ⚠️ {errorMsg}
                </div>
            )}

            {/* Preview */}
            {status === 'success' && previewUrl && (
                <div>
                    <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Preview
                    </p>
                    <img
                        src={previewUrl}
                        alt="Generated background"
                        style={{
                            width: '100%', aspectRatio: '16/9', objectFit: 'cover',
                            borderRadius: '10px', marginBottom: '10px',
                            border: '1px solid rgba(6,182,212,0.4)',
                        }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button style={s.applyBtn()} onClick={handleApply}>
                            🖼️ Apply as Background
                        </button>
                        <button style={s.retryBtn()} onClick={() => generate()}>
                            🔄 Try Again
                        </button>
                    </div>
                </div>
            )}

            {/* History */}
            {history.length > 0 && (
                <div>
                    <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Recent Generations
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px' }}>
                        {history.map(entry => (
                            <div key={entry.id} style={{ position: 'relative' }}>
                                <img
                                    src={entry.imageUrl}
                                    alt={entry.prompt}
                                    style={s.historyThumb(selectedHist === entry.id)}
                                    onClick={() => handleHistoryClick(entry)}
                                    title={entry.prompt}
                                />
                                <div style={{
                                    position: 'absolute', bottom: 0, left: 0, right: 0,
                                    padding: '4px 6px',
                                    background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                                    borderRadius: '0 0 8px 8px',
                                    fontSize: '10px', color: '#ccc',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                    {entry.prompt}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default AIBackgroundGenerator;
