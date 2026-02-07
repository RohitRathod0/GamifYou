import { BackgroundImage } from './types';

/**
 * Predefined background images for virtual backgrounds
 */

export const BACKGROUND_IMAGES: BackgroundImage[] = [
    {
        id: 'beach',
        name: 'Beach Paradise',
        url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=200&h=150&fit=crop',
        category: 'nature',
    },
    {
        id: 'office',
        name: 'Modern Office',
        url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=200&h=150&fit=crop',
        category: 'office',
    },
    {
        id: 'space',
        name: 'Outer Space',
        url: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=200&h=150&fit=crop',
        category: 'space',
    },
    {
        id: 'city',
        name: 'City Skyline',
        url: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=200&h=150&fit=crop',
        category: 'city',
    },
    {
        id: 'mountains',
        name: 'Mountain View',
        url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=200&h=150&fit=crop',
        category: 'nature',
    },
    {
        id: 'abstract1',
        name: 'Abstract Waves',
        url: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1557672172-298e090bd0f1?w=200&h=150&fit=crop',
        category: 'abstract',
    },
    {
        id: 'library',
        name: 'Library',
        url: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=200&h=150&fit=crop',
        category: 'office',
    },
    {
        id: 'forest',
        name: 'Forest Path',
        url: 'https://images.unsplash.com/photo-1511497584788-876760111969?w=1920&h=1080&fit=crop',
        thumbnail: 'https://images.unsplash.com/photo-1511497584788-876760111969?w=200&h=150&fit=crop',
        category: 'nature',
    },
];

export const PRESET_COLORS = [
    { name: 'Green Screen', value: '#00ff00' },
    { name: 'Blue', value: '#0066ff' },
    { name: 'Purple Gradient', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { name: 'Sunset', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
    { name: 'Ocean', value: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
    { name: 'Dark', value: '#1a1a1a' },
];
