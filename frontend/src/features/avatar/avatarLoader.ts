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
 * Create a simple fallback avatar (sphere with eyes)
 */
export const createFallbackAvatar = (): THREE.Group => {
    const group = new THREE.Group();

    // Head (sphere)
    const headGeometry = new THREE.SphereGeometry(1, 32, 32);
    const headMaterial = new THREE.MeshStandardMaterial({
        color: 0xffdbac,
        roughness: 0.7,
        metalness: 0.1,
    });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    group.add(head);

    // Left eye
    const eyeGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(-0.3, 0.2, 0.8);
    group.add(leftEye);

    // Right eye
    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(0.3, 0.2, 0.8);
    group.add(rightEye);

    // Mouth (torus)
    const mouthGeometry = new THREE.TorusGeometry(0.3, 0.05, 16, 32, Math.PI);
    const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const mouth = new THREE.Mesh(mouthGeometry, mouthMaterial);
    mouth.position.set(0, -0.3, 0.8);
    mouth.rotation.x = Math.PI;
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
