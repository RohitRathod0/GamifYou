/**
 * segmentationSingleton.ts
 *
 * Provides a single, globally-shared SelfieSegmentation instance.
 *
 * WHY THIS EXISTS:
 *  - MediaPipe's Emscripten WASM runtime registers globals (Module.arguments, etc.)
 *    that cannot be re-initialized in the same JS context.
 *  - React 18 StrictMode deliberately double-invokes effects in development, which
 *    would cause `seg.initialize()` to run twice → crash:
 *    "RuntimeError: Aborted(Module.arguments has been replaced with plain arguments_)"
 *  - By caching the initialization Promise at module scope, any subsequent calls
 *    to `getSegmentation()` receive the same in-flight or resolved Promise, so WASM
 *    init runs exactly once per page load.
 */

const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747';

/** Step 1 — inject the selfie_segmentation.js CDN script exactly once. */
function loadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
        if ((window as any).SelfieSegmentation) { resolve(); return; }

        const existing = document.getElementById('mp-selfie-seg-script');
        if (existing) {
            // Script tag already in DOM — attach listeners and wait
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('MediaPipe CDN script failed')));
            // If it already fired (rare race), window.SelfieSegmentation will be set
            if ((window as any).SelfieSegmentation) resolve();
            return;
        }

        const script = document.createElement('script');
        script.id = 'mp-selfie-seg-script';
        script.src = `${CDN}/selfie_segmentation.js`;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`CDN load failed: ${script.src}`));
        document.head.appendChild(script);
    });
}

/** Module-level cache — survives React StrictMode unmount/remount cycles. */
let _initPromise: Promise<any> | null = null;

/**
 * Returns a fully-initialised SelfieSegmentation instance.
 * Calling this multiple times always returns the same Promise / instance.
 *
 * Usage:
 *   const seg = await getSegmentation();
 *   seg.onResults(myHandler);
 */
export async function getSegmentation(): Promise<any> {
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        await loadScript();

        const SelfieSegmentation = (window as any).SelfieSegmentation;
        if (!SelfieSegmentation) {
            throw new Error('SelfieSegmentation not found on window after CDN load');
        }

        const seg = new SelfieSegmentation({
            locateFile: (f: string) => `${CDN}/${f}`,
        });
        seg.setOptions({ modelSelection: 0, selfieMode: false });
        await seg.initialize();
        return seg;
    })();

    return _initPromise;
}

/**
 * Fire-and-forget frame send. Safe to call every rAF tick.
 * Errors are silently swallowed so they never break the animation loop.
 */
export async function sendFrame(video: HTMLVideoElement): Promise<void> {
    try {
        const seg = await getSegmentation();
        await seg.send({ image: video });
    } catch {
        // Ignore transient send errors (e.g. frame dropped mid-transition)
    }
}

