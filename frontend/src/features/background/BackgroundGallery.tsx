import React, { useState } from 'react';
import { BackgroundConfig } from './types';
import { BACKGROUND_IMAGES, PRESET_COLORS } from './backgroundData';

interface BackgroundGalleryProps {
    onSelectBackground: (config: BackgroundConfig) => void;
    currentConfig: BackgroundConfig;
}

export const BackgroundGallery: React.FC<BackgroundGalleryProps> = ({
    onSelectBackground,
    currentConfig,
}) => {
    const [activeTab, setActiveTab] = useState<'none' | 'blur' | 'image' | 'color'>('none');

    return (
        <div style={{
            backgroundColor: '#2a2a2a',
            borderRadius: '12px',
            padding: '20px',
            color: '#fff',
        }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>🎨 Virtual Background</h3>

            {/* Tabs */}
            <div style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '20px',
                borderBottom: '2px solid #444',
                paddingBottom: '10px',
            }}>
                {['none', 'blur', 'image', 'color'].map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as any)}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: activeTab === tab ? '#4CAF50' : '#444',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            textTransform: 'capitalize',
                            transition: 'all 0.2s',
                        }}
                    >
                        {tab === 'none' ? 'Off' : tab}
                    </button>
                ))}
            </div>

            {/* None */}
            {activeTab === 'none' && (
                <div>
                    <p>No virtual background applied.</p>
                    <button
                        onClick={() => onSelectBackground({ type: 'none' })}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: '#4CAF50',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                        }}
                    >
                        Disable Background
                    </button>
                </div>
            )}

            {/* Blur */}
            {activeTab === 'blur' && (
                <div>
                    <p>Blur your background (portrait mode)</p>
                    <div style={{ marginBottom: '15px' }}>
                        <label>Blur Amount: </label>
                        <input
                            type="range"
                            min="0"
                            max="20"
                            defaultValue="10"
                            onChange={(e) => {
                                onSelectBackground({
                                    type: 'blur',
                                    blurAmount: parseInt(e.target.value),
                                });
                            }}
                            style={{ width: '200px', marginLeft: '10px' }}
                        />
                    </div>
                    <button
                        onClick={() => onSelectBackground({ type: 'blur', blurAmount: 10 })}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: '#4CAF50',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                        }}
                    >
                        Apply Blur
                    </button>
                </div>
            )}

            {/* Image Backgrounds */}
            {activeTab === 'image' && (
                <div>
                    <p>Choose a background image:</p>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                        gap: '15px',
                        marginTop: '15px',
                    }}>
                        {BACKGROUND_IMAGES.map((bg) => (
                            <div
                                key={bg.id}
                                onClick={() => onSelectBackground({ type: 'image', imageUrl: bg.url })}
                                style={{
                                    cursor: 'pointer',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    border: currentConfig.imageUrl === bg.url ? '3px solid #4CAF50' : '2px solid #444',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <img
                                    src={bg.thumbnail}
                                    alt={bg.name}
                                    style={{
                                        width: '100%',
                                        height: '100px',
                                        objectFit: 'cover',
                                        display: 'block',
                                    }}
                                />
                                <div style={{
                                    padding: '8px',
                                    backgroundColor: '#333',
                                    fontSize: '12px',
                                    textAlign: 'center',
                                }}>
                                    {bg.name}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Color Backgrounds */}
            {activeTab === 'color' && (
                <div>
                    <p>Choose a solid color or gradient:</p>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                        gap: '15px',
                        marginTop: '15px',
                    }}>
                        {PRESET_COLORS.map((color, index) => (
                            <div
                                key={index}
                                onClick={() => onSelectBackground({ type: 'color', color: color.value })}
                                style={{
                                    cursor: 'pointer',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    border: currentConfig.color === color.value ? '3px solid #4CAF50' : '2px solid #444',
                                    transition: 'all 0.2s',
                                }}
                            >
                                <div
                                    style={{
                                        width: '100%',
                                        height: '80px',
                                        background: color.value,
                                    }}
                                />
                                <div style={{
                                    padding: '8px',
                                    backgroundColor: '#333',
                                    fontSize: '12px',
                                    textAlign: 'center',
                                }}>
                                    {color.name}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: '20px' }}>
                        <label>Custom Color: </label>
                        <input
                            type="color"
                            onChange={(e) => onSelectBackground({ type: 'color', color: e.target.value })}
                            style={{
                                marginLeft: '10px',
                                width: '50px',
                                height: '30px',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
