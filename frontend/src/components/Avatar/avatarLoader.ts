import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Avatar Loader - Handles loading and caching of 3D avatar models
 */

const loader = new GLTFLoader();
const modelCache = new Map<string, GLTF>();

export interface LoadedAvatar {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
    mixer?: THREE.AnimationMixer;
    morphTargets?: Map<string, THREE.Mesh>;
}

/**
 * Load a GLTF avatar model
 */
export const loadAvatarModel = async (url: string): Promise<LoadedAvatar> => {
    // Check cache first
    if (modelCache.has(url)) {
        const cached = modelCache.get(url)!;
        return {
            scene: cached.scene.clone(),
            animations: cached.animations,
        };
    }

    return new Promise((resolve, reject) => {
        loader.load(
            url,
            (gltf) => {
                // Cache the model
                modelCache.set(url, gltf);

                // Find meshes with morph targets (for blend shapes)
                const morphTargets = new Map<string, THREE.Mesh>();
                gltf.scene.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.morphTargetInfluences) {
                        morphTargets.set(child.name, child);
                    }
                });

                resolve({
                    scene: gltf.scene,
                    animations: gltf.animations,
                    morphTargets,
                });
            },
            undefined,
            (error) => {
                console.error('Error loading avatar model:', error);
                reject(error);
            }
        );
    });
};

/**
 * Create a customizable fallback avatar
 */
export const createFallbackAvatar = (
    skinColor?: { r: number; g: number; b: number },
    hairColor?: 'dark' | 'light',
    faceShape?: { width: number; height: number }
): THREE.Group => {
    const group = new THREE.Group();

    // Determine skin color
    const color = skinColor
        ? new THREE.Color(`rgb(${skinColor.r}, ${skinColor.g}, ${skinColor.b})`)
        : new THREE.Color(0xffdbac);

    // Face shape scaling
    const widthScale = faceShape?.width || 1;
    const heightScale = faceShape?.height || 1;

    // Head (sphere with custom proportions)
    const headGeometry = new THREE.SphereGeometry(1, 32, 32);
    const headMaterial = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.7,
        metalness: 0.1,
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.scale.set(widthScale, heightScale, 1);
    group.add(head);

    // Hair (hemisphere on top)
    if (hairColor) {
        const hairColorValue = hairColor === 'dark'
            ? new THREE.Color(0x2a1a0a)
            : new THREE.Color(0xc4a35a);

        const hairGeometry = new THREE.SphereGeometry(1.05, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const hairMaterial = new THREE.MeshStandardMaterial({
            color: hairColorValue,
            roughness: 0.9,
            metalness: 0,
        });
        const hair = new THREE.Mesh(hairGeometry, hairMaterial);
        hair.position.y = 0.3;
        hair.scale.set(widthScale * 1.05, heightScale * 0.8, 1.05);
        group.add(hair);
    }

    // Left eye
    const eyeGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.3 * widthScale, 0.2 * heightScale, 0.8);
    group.add(leftEye);

    // Right eye
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.3 * widthScale, 0.2 * heightScale, 0.8);
    group.add(rightEye);

    // Mouth (torus)
    const mouthGeometry = new THREE.TorusGeometry(0.3 * widthScale, 0.05, 16, 32, Math.PI);
    const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, -0.3 * heightScale, 0.8);
    mouth.rotation.x = Math.PI;
    mouth.name = 'mouth';
    group.add(mouth);

    return group;
};

/**
 * Setup animation mixer for avatar
 */
export const setupAnimationMixer = (
    scene: THREE.Group,
    animations: THREE.AnimationClip[]
): THREE.AnimationMixer | undefined => {
    if (animations.length === 0) return undefined;

    const mixer = new THREE.AnimationMixer(scene);

    // Play idle animation if available
    const idleAnimation = animations.find(
        (clip) => clip.name.toLowerCase().includes('idle')
    );

    if (idleAnimation) {
        const action = mixer.clipAction(idleAnimation);
        action.play();
    }

    return mixer;
};

/**
 * Clear model cache
 */
export const clearAvatarCache = () => {
    modelCache.clear();
};
