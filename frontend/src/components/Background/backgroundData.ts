import { BackgroundImage, GradientPreset, StyleFilterDef } from './types';

export const BACKGROUND_IMAGES: BackgroundImage[] = [
    {
        id: 'beach',
        name: 'Beach',
        url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=320&h=180&fit=crop',
        category: 'nature',
    },
    {
        id: 'office',
        name: 'Modern Office',
        url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=320&h=180&fit=crop',
        category: 'office',
    },
    {
        id: 'space',
        name: 'Outer Space',
        url: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=320&h=180&fit=crop',
        category: 'space',
    },
    {
        id: 'city',
        name: 'City Night',
        url: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=320&h=180&fit=crop',
        category: 'city',
    },
    {
        id: 'mountains',
        name: 'Mountains',
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=320&h=180&fit=crop',
        category: 'nature',
    },
    {
        id: 'abstract',
        name: 'Abstract',
        url: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=320&h=180&fit=crop',
        category: 'abstract',
    },
    {
        id: 'library',
        name: 'Library',
        url: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=320&h=180&fit=crop',
        category: 'office',
    },
    {
        id: 'forest',
        name: 'Forest',
        url: 'https://images.unsplash.com/photo-1511497584788-876760111969?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1511497584788-876760111969?w=320&h=180&fit=crop',
        category: 'nature',
    },
    {
        id: 'galaxy',
        name: 'Galaxy',
        url: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=320&h=180&fit=crop',
        category: 'space',
    },
    {
        id: 'cafe',
        name: 'Cozy Café',
        url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=320&h=180&fit=crop',
        category: 'office',
    },
    {
        id: 'waterfall',
        name: 'Waterfall',
        url: 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1546182990-dffeafbe841d?w=320&h=180&fit=crop',
        category: 'nature',
    },
    {
        id: 'tokyo',
        name: 'Tokyo',
        url: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=320&h=180&fit=crop',
        category: 'city',
    },
];

export const GRADIENT_PRESETS: GradientPreset[] = [
    { name: 'Sunset', colors: ['#ff6b6b', '#feca57', '#ff9ff3'], angle: 135 },
    { name: 'Ocean', colors: ['#4facfe', '#00f2fe'], angle: 135 },
    { name: 'Purple Rain', colors: ['#a18cd1', '#fbc2eb'], angle: 135 },
    { name: 'Emerald', colors: ['#0ba360', '#3cba92'], angle: 135 },
    { name: 'Midnight', colors: ['#0f0c29', '#302b63', '#24243e'], angle: 135 },
    { name: 'Sakura', colors: ['#fddb92', '#d1fdff'], angle: 135 },
    { name: 'Neon Night', colors: ['#0d0d0d', '#1a0533', '#4a0080'], angle: 135 },
    { name: 'Arctic', colors: ['#dfe9f3', '#ffffff'], angle: 180 },
];

export const PRESET_COLORS = [
    { name: 'Green Screen', value: '#00ff00' },
    { name: 'Navy Blue', value: '#003366' },
    { name: 'Deep Purple', value: '#1a0533' },
    { name: 'Charcoal', value: '#1a1a2e' },
    { name: 'Slate', value: '#2d3436' },
    { name: 'Midnight', value: '#0a0a0a' },
];

export const STYLE_FILTERS: StyleFilterDef[] = [
    {
        id: 'grayscale',
        name: 'Grayscale',
        emoji: '⚫',
        cssFilter: 'grayscale(100%)',
    },
    {
        id: 'sepia',
        name: 'Sepia',
        emoji: '🟤',
        cssFilter: 'sepia(100%)',
    },
    {
        id: 'invert',
        name: 'Invert',
        emoji: '🔄',
        cssFilter: 'invert(100%)',
    },
    {
        id: 'neon',
        name: 'Neon',
        emoji: '💜',
        cssFilter: 'hue-rotate(120deg) saturate(200%) brightness(1.2)',
    },
    {
        id: 'vintage',
        name: 'Vintage',
        emoji: '📷',
        cssFilter: 'sepia(50%) contrast(120%) brightness(90%)',
    },
    {
        id: 'cool',
        name: 'Cool Tone',
        emoji: '🔵',
        cssFilter: 'hue-rotate(180deg) saturate(150%)',
    },
    {
        id: 'warm',
        name: 'Warm Tone',
        emoji: '🟡',
        cssFilter: 'hue-rotate(330deg) saturate(150%) brightness(1.1)',
    },
    {
        id: 'hue-rotate',
        name: 'Psychedelic',
        emoji: '🌈',
        cssFilter: 'hue-rotate(90deg) saturate(300%) contrast(150%)',
    },
    {
        id: 'pixelate',
        name: 'Blur + Contrast',
        emoji: '🟣',
        cssFilter: 'blur(1px) contrast(200%) saturate(200%)',
    },
];
