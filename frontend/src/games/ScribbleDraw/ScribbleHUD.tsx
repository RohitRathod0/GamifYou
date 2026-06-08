import React from 'react';

interface ScribbleHUDProps {
    round: number;
    maxRounds: number;
    timeLeft: number;
    word?: string;
    wordHint: string;
    isDrawer: boolean;
    scores: Record<string, number>;
    usernames: Record<string, string>;
}

export const ScribbleHUD: React.FC<ScribbleHUDProps> = ({ round, maxRounds, timeLeft, word, wordHint, isDrawer, scores, usernames }) => {
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
                    {isDrawer ? word : (wordHint || '---')}
                </div>
            </div>
            
            <div style={{ background: '#222', padding: '15px', borderRadius: '12px', border: '1px solid #444', flex: 1 }}>
                <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '10px', textTransform: 'uppercase' }}>🥇 Leaderboard</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(scores)
                        .sort(([, a], [, b]) => b - a)
                        .map(([pid, score], i) => (
                        <div key={pid} style={{
                            display: 'flex', justifyContent: 'space-between',
                            padding: '8px 10px',
                            background: i === 0 ? 'rgba(255,215,0,0.15)' : '#333',
                            borderRadius: '8px',
                            alignItems: 'center',
                            border: i === 0 ? '1px solid rgba(255,215,0,0.3)' : '1px solid transparent',
                        }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                                <span style={{ fontSize: '1rem' }}>
                                    {i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : '▪️'}
                                </span>
                                <span style={{
                                    fontSize: '0.85rem',
                                    color: i === 0 ? '#ffd700' : '#e5e7eb',
                                    fontWeight: i === 0 ? 700 : 500,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: '130px',
                                }}>
                                    {usernames[pid] ?? pid.slice(0, 8) + '...'}
                                </span>
                            </span>
                            <span style={{
                                fontWeight: 'bold',
                                fontSize: '1rem',
                                color: i === 0 ? '#ffd700' : '#fff',
                                minWidth: '36px',
                                textAlign: 'right',
                            }}>{score}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
