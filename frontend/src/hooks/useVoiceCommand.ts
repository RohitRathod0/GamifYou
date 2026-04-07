import { useState, useRef, useCallback, useEffect } from 'react';
import { voiceAPI } from '@/utils/api';

export interface VoiceIntentResult {
    text: string;
    intent: string;
    confidence: number;
    action: any;
}

export function useVoiceCommand(onIntentMatched: (result: VoiceIntentResult) => void) {
    const [isListening, setIsListening] = useState(false);
    const [isTalking, setIsTalking] = useState(false);
    
    const intentCallbackRef = useRef(onIntentMatched);
    useEffect(() => {
        intentCallbackRef.current = onIntentMatched;
    }, [onIntentMatched]);
    
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    
    // WebAudio API nodes for Voice Activity Detection
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const checkIntervalRef = useRef<number | null>(null);
    const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

    const cleanupAudio = useCallback(() => {
        if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }
        
        setIsTalking(false);
    }, []);

    // Helper: start the media recorder cleanly
    const startInnerRecorder = useCallback(() => {
        if (!streamRef.current) return;
        chunksRef.current = [];
        try {
            mediaRecorderRef.current = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm' });
            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            
            mediaRecorderRef.current.onstop = async () => {
                if (chunksRef.current.length > 0) {
                    const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
                    // Only send if it has any substantial volume/content
                    if (audioBlob.size > 2000) {  
                        try {
                            const result = await voiceAPI.sendCommand(audioBlob);
                            if (result && intentCallbackRef.current) intentCallbackRef.current(result);
                        } catch (err) {
                            console.error('Error processing voice command:', err);
                        }
                    }
                }
                
                // Immediately restart the recorder if we are still fundamentally in 'listening' mode
                if (isListening) {
                    startInnerRecorder();
                }
            };
            mediaRecorderRef.current.start();
        } catch (err) {
            console.error("Failed to start inner recorder:", err);
        }
    }, [isListening]);

    const initVAD = useCallback(async () => {
        try {
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContextRef.current = new AudioContext();
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.minDecibels = -60;
            analyserRef.current.smoothingTimeConstant = 0.8;

            const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
            source.connect(analyserRef.current);

            // Kick off the first recorder
            startInnerRecorder();

            const pcmData = new Float32Array(analyserRef.current.fftSize);
            
            let currentTalkingState = false;

            // Monitor volume constantly
            checkIntervalRef.current = window.setInterval(() => {
                if (!analyserRef.current) return;
                analyserRef.current.getFloatTimeDomainData(pcmData);
                
                let sumSquares = 0.0;
                for (const amplitude of pcmData) {
                    sumSquares += amplitude * amplitude;
                }
                const rms = Math.sqrt(sumSquares / pcmData.length);
                
                // Threshold for detecting speech (adjust if too sensitive/insensitive)
                const isSpeakingNow = rms > 0.02;

                if (isSpeakingNow) {
                    if (!currentTalkingState) {
                        currentTalkingState = true;
                        setIsTalking(true);
                    }
                    if (silenceTimerRef.current) {
                        clearTimeout(silenceTimerRef.current);
                        silenceTimerRef.current = null;
                    }
                } else {
                    if (currentTalkingState && !silenceTimerRef.current) {
                        silenceTimerRef.current = setTimeout(() => {
                            // User stopped talking for 1.2s
                            currentTalkingState = false;
                            setIsTalking(false);
                            silenceTimerRef.current = null;
                            
                            // Trigger chunk send by stopping recorder 
                            // (it will instantly auto-restart onstop if isListening is true)
                            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                                mediaRecorderRef.current.stop();
                            }
                        }, 1200);
                    }
                }
            }, 50);

        } catch (err) {
            console.error('Failed to initialize VAD:', err);
            setIsListening(false);
        }
    }, [startInnerRecorder]);

    useEffect(() => {
        if (isListening) {
            initVAD();
        } else {
            cleanupAudio();
        }
    }, [isListening, initVAD, cleanupAudio]);

    // Cleanup on unmount
    useEffect(() => {
        return cleanupAudio;
    }, [cleanupAudio]);

    const toggleListening = useCallback(() => {
        setIsListening(prev => !prev);
    }, []);

    return {
        isListening,
        setIsListening,
        isTalking,
        toggleListening
    };
}
