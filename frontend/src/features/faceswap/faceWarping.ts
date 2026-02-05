// Advanced face warping using Delaunay triangulation

/**
 * Delaunay triangulation for face warping
 * This creates a mesh of triangles that can be warped to match expressions
 */

export type Triangle = [number, number, number];

/**
 * Calculate Delaunay triangulation from face landmarks
 * Using a simplified approach for real-time performance
 */
export const createFaceTriangulation = (): Triangle[] => {
    // MediaPipe Face Mesh has a predefined triangulation
    // These are the triangle indices for the 468 landmarks
    // Using a subset for better performance

    const triangles: Triangle[] = [
        // Forehead region
        [10, 338, 297], [10, 297, 332], [10, 332, 284],
        [10, 284, 251], [10, 251, 389], [10, 389, 356],

        // Left eye region
        [33, 246, 161], [33, 161, 160], [33, 160, 159],
        [33, 159, 158], [33, 158, 157], [33, 157, 173],

        // Right eye region
        [263, 466, 388], [263, 388, 387], [263, 387, 386],
        [263, 386, 385], [263, 385, 384], [263, 384, 398],

        // Nose region
        [1, 4, 5], [1, 5, 195], [1, 195, 197],
        [1, 197, 2], [2, 197, 94], [2, 94, 19],

        // Mouth region
        [61, 146, 91], [61, 91, 181], [61, 181, 84],
        [61, 84, 17], [17, 84, 314], [17, 314, 405],
        [17, 405, 321], [17, 321, 375], [17, 375, 291],

        // Cheek regions
        [234, 227, 137], [234, 137, 177], [234, 177, 215],
        [454, 447, 366], [454, 366, 401], [454, 401, 435],

        // Jaw region
        [172, 136, 150], [172, 150, 149], [172, 149, 176],
        [397, 365, 379], [397, 379, 378], [397, 378, 400],

        // Face outline
        [10, 109, 67], [10, 67, 103], [10, 103, 54],
        [10, 54, 21], [21, 54, 162], [21, 162, 127],
        [127, 162, 234], [234, 162, 93], [234, 93, 132],

        // Additional coverage triangles
        [127, 234, 93], [127, 93, 132], [132, 93, 58],
        [356, 454, 323], [356, 323, 361], [361, 323, 288],
    ];

    return triangles;
};

/**
 * Warp a triangle from source to destination using affine transformation
 */
export const warpTriangle = (
    srcCanvas: HTMLCanvasElement,
    dstCanvas: HTMLCanvasElement,
    srcPoints: { x: number; y: number }[],
    dstPoints: { x: number; y: number }[]
): void => {
    const ctx = dstCanvas.getContext('2d');
    if (!ctx) return;

    // Calculate affine transformation matrix
    const [src1, src2, src3] = srcPoints;
    const [dst1, dst2, dst3] = dstPoints;

    // Create transformation matrix
    const x1 = src1.x, y1 = src1.y;
    const x2 = src2.x, y2 = src2.y;
    const x3 = src3.x, y3 = src3.y;

    const u1 = dst1.x, v1 = dst1.y;
    const u2 = dst2.x, v2 = dst2.y;
    const u3 = dst3.x, v3 = dst3.y;

    // Calculate the affine transform
    const denom = (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
    if (Math.abs(denom) < 1e-10) return; // Degenerate triangle

    const a = ((u1 - u3) * (y2 - y3) - (u2 - u3) * (y1 - y3)) / denom;
    const b = ((x1 - x3) * (u2 - u3) - (x2 - x3) * (u1 - u3)) / denom;
    const c = u1 - a * x1 - b * y1;

    const d = ((v1 - v3) * (y2 - y3) - (v2 - v3) * (y1 - y3)) / denom;
    const e = ((x1 - x3) * (v2 - v3) - (x2 - x3) * (v1 - v3)) / denom;
    const f = v1 - d * x1 - e * y1;

    // Create clipping path for destination triangle
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dst1.x, dst1.y);
    ctx.lineTo(dst2.x, dst2.y);
    ctx.lineTo(dst3.x, dst3.y);
    ctx.closePath();
    ctx.clip();

    // Apply transformation and draw
    ctx.transform(a, d, b, e, c, f);
    ctx.drawImage(srcCanvas, 0, 0);
    ctx.restore();
};

/**
 * Warp entire face using triangulation
 */
export const warpFaceWithTriangulation = (
    srcCanvas: HTMLCanvasElement,
    srcLandmarks: any[],
    dstCanvas: HTMLCanvasElement,
    dstLandmarks: any[],
    canvasWidth: number,
    canvasHeight: number
): void => {
    const triangles = createFaceTriangulation();
    const ctx = dstCanvas.getContext('2d');
    if (!ctx) return;

    // Process each triangle
    triangles.forEach((triangle) => {
        const [i1, i2, i3] = triangle;

        // Get source triangle points
        const srcPoints = [
            { x: srcLandmarks[i1].x * canvasWidth, y: srcLandmarks[i1].y * canvasHeight },
            { x: srcLandmarks[i2].x * canvasWidth, y: srcLandmarks[i2].y * canvasHeight },
            { x: srcLandmarks[i3].x * canvasWidth, y: srcLandmarks[i3].y * canvasHeight },
        ];

        // Get destination triangle points
        const dstPoints = [
            { x: dstLandmarks[i1].x * canvasWidth, y: dstLandmarks[i1].y * canvasHeight },
            { x: dstLandmarks[i2].x * canvasWidth, y: dstLandmarks[i2].y * canvasHeight },
            { x: dstLandmarks[i3].x * canvasWidth, y: dstLandmarks[i3].y * canvasHeight },
        ];

        // Warp this triangle
        warpTriangle(srcCanvas, dstCanvas, srcPoints, dstPoints);
    });
};

/**
 * Create a convex hull mask from face landmarks
 */
export const createConvexHullMask = (
    landmarks: any[],
    width: number,
    height: number
): HTMLCanvasElement => {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;

    const ctx = maskCanvas.getContext('2d');
    if (!ctx) return maskCanvas;

    // Face outline indices (convex hull)
    const hullIndices = [
        10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
        397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
        172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109
    ];

    // Create path from hull
    ctx.fillStyle = 'white';
    ctx.beginPath();
    hullIndices.forEach((idx, i) => {
        const x = landmarks[idx].x * width;
        const y = landmarks[idx].y * height;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.closePath();
    ctx.fill();

    // Feather the edges
    ctx.globalCompositeOperation = 'destination-in';
    const gradient = ctx.createRadialGradient(
        width / 2, height / 2, width * 0.2,
        width / 2, height / 2, width * 0.5
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.8, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    return maskCanvas;
};
