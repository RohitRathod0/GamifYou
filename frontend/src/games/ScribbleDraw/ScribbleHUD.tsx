import React from 'react';

interface ScribbleHUDProps {
    round: number;
    maxRounds: number;
    timeLeft: number;
    wordHint: string;
    isDrawer: boolean;
    scores: Record<string, number>;
}

export const ScribbleHUD: React.FC<ScribbleHUDProps> = ({ round, maxRounds, timeLeft, wordHint, isDrawer, scores }) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '250px', gap: '15px' }}>
            <div style={{ background: '#222', padding: '15px', borderRadius: '12px', border: '1px solid #444' }}>
                <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '5px' }}>
                    Round {round} of {maxRounds}
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 'bold', color: timeLeft <= 10 ? '#ef4444' : '#fff' }}>
                    ⏱️ {Math.ceil(timeLeft)}s
                </div>
            </div>
            
            <div style={{ background: '#222', padding: '15px', borderRadius: '12px', textAlign: 'center', border: '1px solid #444' }}>
                <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '8px' }}>
                    {isDrawer ? 'Draw this word:' : 'Word Hint:'}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', letterSpacing: '3px', color: '#60a5fa' }}>
                    {wordHint || '---'}
                </div>
            </div>
            
            <div style={{ background: '#222', padding: '15px', borderRadius: '12px', border: '1px solid #444', flex: 1 }}>
                <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '10px', textTransform: 'uppercase' }}>🥇 Leaderboard</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(scores)
                        .sort(([, a], [, b]) => b - a)
                        .map(([pid, score], i) => (
                        <div key={pid} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', background: i === 0 ? 'rgba(255,215,0,0.1)' : '#333', borderRadius: '8px' }}>
                            <span>
                               {i === 0 ? '👑 ' : ''}{pid}
                            </span>
                            <span style={{ fontWeight: 'bold', color: i === 0 ? '#ffd700' : '#fff' }}>{score}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
