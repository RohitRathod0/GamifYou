import React, { useEffect, useState, useRef } from 'react';
import { DrawerView } from './DrawerView';
import { GuesserView } from './GuesserView';
import { ScribbleHUD } from './ScribbleHUD';
import { ScribbleChat, ChatMessage } from './ScribbleChat';
import { StrokeData } from './useFingerDraw';

import { useHandTracking } from '@/hooks/useHandTracking';

interface ScribbleDrawProps {
    localStream?: MediaStream | null;
    playerId: string;
    sendMessage: (type: string, data: any) => void;
}

export const ScribbleDraw: React.FC<ScribbleDrawProps> = ({
    localStream,
    playerId,
    sendMessage
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const { trackingData, trackingDataRef } = useHandTracking(videoRef, localStream);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [gameState, setGameState] = useState<any>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [strokes, setStrokes] = useState<(StrokeData & { player_id: string })[]>([]);
    const [clearTrigger, setClearTrigger] = useState(0);

    const isDrawer = gameState?.drawer_id === playerId;
    
    // Request state on mount
    useEffect(() => {
        sendMessage('scribble:get_state', {});
    }, [sendMessage]);

    useEffect(() => {
        // decrease timer every second locally to stay smooth
        const intId = setInterval(() => {
             setGameState((prev: any) => {
                  if (prev && prev.time_left > 0 && prev.phase === 'drawing') {
                       return { ...prev, time_left: prev.time_left - 1 };
                  }
                  return prev;
             });
        }, 1000);
        return () => clearInterval(intId);
    }, []);

    useEffect(() => {
        const handleWsMessage = (e: Event) => {
            const customEvent = e as CustomEvent;
            const { type, data } = customEvent.detail;
            
            if (type === 'scribble:state' || type === 'scribble:hint') {
                setGameState((prev: any) => ({ ...prev, ...data }));
            } else if (type === 'scribble:turn_start') {
                setGameState({ ...data, phase: 'drawing' });
                setStrokes([]);
                setClearTrigger(c => c + 1);
                addSystemMessage(`🖌️ ${data.drawer_username} is drawing now!`);
            } else if (type === 'scribble:stroke') {
                setStrokes(s => [...s, { ...data }]);
            } else if (type === 'scribble:clear') {
                setStrokes([]);
                setClearTrigger(c => c + 1);
            } else if (type === 'scribble:canvas_replay') {
                if (data?.strokes) setStrokes(data.strokes);
            } else if (type === 'scribble:chat') {
                setMessages(m => [
                    ...m, 
                    { id: Date.now().toString() + Math.random(), sender: data.username, text: data.text, isSystem: false, isCorrect: false }
                ]);
            } else if (type === 'scribble:correct') {
                setGameState((prev: any) => ({ ...prev, scores: data.scores }));
                setMessages(m => [
                    ...m,
                    { id: Date.now().toString() + Math.random(), sender: data.username, text: 'guessed the word!', isSystem: false, isCorrect: true }
                ]);
            } else if (type === 'scribble:round_end') {
                setGameState((prev: any) => ({ ...prev, phase: 'round_end' }));
                addSystemMessage(`Round over! The word was: ${data.word}`);
                
                // Auto start next turn if sent via payload
                if (data.next_turn) {
                    setTimeout(() => {
                        setGameState({ ...data.next_turn, phase: 'drawing' });
                        setStrokes([]);
                        setClearTrigger(c => c + 1);
                        addSystemMessage(`🖌️ ${data.next_turn.drawer_username} is drawing now!`);
                    }, 4000);
                } else if (data.game_over) {
                    setTimeout(() => {
                        setGameState((prev: any) => ({ ...prev, phase: 'game_over', scores: data.game_over.final_scores }));
                        addSystemMessage(`Game over!`);
                    }, 4000);
                }
            } else if (type === 'scribble:game_over') {
                setGameState((prev: any) => ({ ...prev, phase: 'game_over', scores: data.final_scores }));
                addSystemMessage(`Game over! Winner: ${data.winner_username || 'Draw'}`);
            }
        };

        window.addEventListener('scribbleMessage', handleWsMessage);
        return () => window.removeEventListener('scribbleMessage', handleWsMessage);
    }, []);

    const addSystemMessage = (text: string) => {
        setMessages(m => [...m, { id: Date.now().toString() + Math.random(), sender: 'System', text, isSystem: true, isCorrect: false }]);
    };

    const handleSendStroke = (stroke: StrokeData) => {
        sendMessage('scribble:stroke', stroke);
    };

    const handleClear = () => {
        sendMessage('scribble:clear', {});
        setStrokes([]);
        setClearTrigger(c => c + 1);
    };

    const handleGuess = (text: string) => {
        sendMessage('scribble:guess', { text });
    };

    const handleStart = () => {
        sendMessage('scribble:start', { rounds: 3, draw_time: 80 });
    };

    return (
        <div style={{ display: 'flex', gap: '20px', padding: '20px', justifyContent: 'center', alignItems: 'flex-start' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }} />
            {gameState ? (
                <>
                    <ScribbleHUD 
                        round={gameState.round_number || 1}
                        maxRounds={gameState.max_rounds || 3}
                        timeLeft={gameState.time_left || 0}
                        wordHint={gameState.word_hint || ''}
                        isDrawer={isDrawer}
                        scores={gameState.scores || {}}
                    />

                    <div style={{ flex: 1, minWidth: '800px', maxWidth: '800px' }}>
                        {gameState.phase === 'game_over' ? (
                            <div style={{ background: '#222', padding: '50px', textAlign: 'center', borderRadius: '12px' }}>
                                <h2>Game Over!</h2>
                                <p>Thanks for playing!</p>
                                <button onClick={handleStart} style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', marginTop: '20px', fontWeight: 'bold' }}>Play Again</button>
                            </div>
                        ) : isDrawer ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ textAlign: 'center', color: '#60a5fa', fontWeight: 'bold', fontSize: '1.2rem', marginBottom: '10px' }}>You are drawing! Put your index and thumb together to draw.</div>
                                <DrawerView 
                                    trackingData={trackingData}
                                    trackingDataRef={trackingDataRef}
                                    playerId={playerId}
                                    onEmitStroke={handleSendStroke}
                                    onEmitClear={handleClear}
                                />
                            </div>
                        ) : (
                            <GuesserView 
                                strokes={strokes}
                                clearTrigger={clearTrigger}
                            />
                        )}
                    </div>

                    <ScribbleChat 
                        messages={messages}
                        onSendGuess={handleGuess}
                        disabled={isDrawer || gameState.phase !== 'drawing'}
                        placeholder={isDrawer ? "Drawers can't chat" : "Type guess..."}
                    />
                </>
            ) : (
                <div style={{ textAlign: 'center', marginTop: '100px' }}>
                    <h2 style={{ marginBottom: '20px' }}>Waiting to start Scribble Draw...</h2>
                    <button 
                        onClick={handleStart}
                        style={{ padding: '15px 30px', fontSize: '1.2rem', background: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        Start Game
                    </button>
                </div>
            )}
        </div>
    );
};
