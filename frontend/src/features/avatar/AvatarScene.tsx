import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { loadAvatarModel, createFallbackAvatar, setupAnimationMixer, LoadedAvatar } from './avatarLoader';
import { HeadPose } from './types';

interface AvatarSceneProps {
    modelUrl?: string;
    headPose?: HeadPose;
    blendShapes?: Record<string, number>;
    skinColor?: { r: number; g: number; b: number };
    hairColor?: 'dark' | 'light';
    faceShape?: { width: number; height: number };
}

/**
 * Avatar Model Component - Renders and animates the 3D avatar
 */
function AvatarModel({ modelUrl, headPose, blendShapes, skinColor, hairColor, faceShape }: AvatarSceneProps) {
    const groupRef = useRef<THREE.Group>(null);
    const mixerRef = useRef<THREE.AnimationMixer>();
    const [avatar, setAvatar] = useState<LoadedAvatar | null>(null);
    const clockRef = useRef(new THREE.Clock());

    // Load avatar model
    useEffect(() => {
        let mounted = true;

        const loadModel = async () => {
            try {
                if (modelUrl) {
                    const loadedAvatar = await loadAvatarModel(modelUrl);
                    if (mounted) {
                        setAvatar(loadedAvatar);
                        mixerRef.current = setupAnimationMixer(loadedAvatar.scene, loadedAvatar.animations);
                    }
                } else {
                    const fallback = createFallbackAvatar(skinColor, hairColor, faceShape);
                    if (mounted) {
                        setAvatar({
                            scene: fallback,
                            animations: [],
                        });
                    }
                }
            } catch (error) {
                console.error('Failed to load avatar, using fallback:', error);
                if (mounted) {
                    const fallback = createFallbackAvatar(skinColor, hairColor, faceShape);
                    setAvatar({
                        scene: fallback,
                        animations: [],
                    });
                }
            }
        };

        loadModel();

        return () => {
            mounted = false;
        };
    }, [modelUrl, skinColor, hairColor, faceShape]);

    // Update head pose
    useEffect(() => {
        if (groupRef.current && headPose) {
            // Apply rotations (convert from degrees to radians if needed)
            groupRef.current.rotation.x = headPose.pitch;
            groupRef.current.rotation.y = headPose.yaw;
            groupRef.current.rotation.z = headPose.roll;
        }
    }, [headPose]);

    // Update blend shapes (morph targets)
    useEffect(() => {
        if (avatar?.morphTargets && blendShapes) {
            avatar.morphTargets.forEach((mesh, name) => {
                if (mesh.morphTargetInfluences && mesh.morphTargetDictionary) {
                    Object.entries(blendShapes).forEach(([shapeName, value]) => {
                        const index = mesh.morphTargetDictionary[shapeName];
                        if (index !== undefined) {
                            mesh.morphTargetInfluences[index] = value;
                        }
                    });
                }
            });
        }

        // Animate mouth for smile on fallback avatar
        if (avatar?.scene && blendShapes) {
            const mouth = avatar.scene.getObjectByName('mouth');
            if (mouth) {
                const smileAmount = (blendShapes.mouthSmileLeft + blendShapes.mouthSmileRight) / 2;
                mouth.rotation.x = Math.PI - smileAmount * 0.5;
                mouth.position.y = -0.3 * (faceShape?.height || 1) + smileAmount * 0.1;
            }
        }
    }, [avatar, blendShapes, faceShape]);

    // Animation loop
    useFrame(() => {
        if (mixerRef.current) {
            const delta = clockRef.current.getDelta();
            mixerRef.current.update(delta);
        }
    });

    if (!avatar) {
        return null;
    }

    return <primitive ref={groupRef} object={avatar.scene} />;
}

/**
 * Avatar Scene Component - Main 3D scene with lighting and camera
 */
export function AvatarScene({ modelUrl, headPose, blendShapes, skinColor, hairColor, faceShape }: AvatarSceneProps) {
    return (
        <div style={{ width: '100%', height: '100%', minHeight: '400px' }}>
            <Canvas>
                {/* Camera */}
                <PerspectiveCamera makeDefault position={[0, 0, 5]} fov={50} />

                {/* Lights */}
                <ambientLight intensity={0.5} />
                <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
                <directionalLight position={[-5, 3, -5]} intensity={0.4} />
                <pointLight position={[0, 2, 0]} intensity={0.3} />

                {/* Avatar */}
                <AvatarModel
                    modelUrl={modelUrl}
                    headPose={headPose}
                    blendShapes={blendShapes}
                    skinColor={skinColor}
                    hairColor={hairColor}
                    faceShape={faceShape}
                />

                {/* Controls */}
                <OrbitControls
                    enableZoom={true}
                    enablePan={false}
                    minDistance={2}
                    maxDistance={10}
                    target={[0, 0, 0]}
                />

                {/* Background */}
                <color attach="background" args={['#1a1a1a']} />
            </Canvas>
        </div>
    );
}
