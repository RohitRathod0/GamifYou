const QUALITY_SUFFIX = ', photorealistic, 4K, cinematic, wide shot, no people, landscape';

export function refinePrompt(userPrompt: string): string {
    return userPrompt + QUALITY_SUFFIX;
}

// PRIMARY: Puter.js — free, unlimited, no key, no CORS
async function generateViaPuter(refined: string): Promise<string> {
    const puter = (window as any).puter;
    if (!puter) throw new Error('Puter not loaded');
    const imgEl = await puter.ai.txt2img(refined, { model: 'flux-schnell' });
    return imgEl.src;
}

// FALLBACK: Replicate FLUX Schnell — fires only if Puter fails
async function generateViaReplicate(refined: string): Promise<string> {
    const token = process.env.REACT_APP_REPLICATE_TOKEN;
    if (!token) throw new Error('No Replicate token');
    const res = await fetch('/replicate-api/v1/models/black-forest-labs/flux-schnell/predictions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'wait'
        },
        body: JSON.stringify({ input: { prompt: refined, width: 1280, height: 720, num_outputs: 1 } })
    });
    if (!res.ok) throw new Error(`Replicate error: ${res.status}`);
    const data = await res.json();
    if (!data.output?.[0]) throw new Error('No output');
    return data.output[0];
}

// MAIN EXPORT
export async function generateBackground(userPrompt: string): Promise<string> {
    const refined = refinePrompt(userPrompt);
    try {
        const url = await generateViaPuter(refined);
        console.log('[AI BG] Puter ✓');
        return url;
    } catch (err) {
        console.warn('[AI BG] Puter failed, trying Replicate:', err);
        return generateViaReplicate(refined);
    }
}
