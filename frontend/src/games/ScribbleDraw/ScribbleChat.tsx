import React, { useState, useRef, useEffect } from 'react';

export interface ChatMessage {
    id: string;
    sender: string;
    text: string;
    isSystem: boolean;
    isCorrect: boolean;
}

interface ScribbleChatProps {
    messages: ChatMessage[];
    onSendGuess: (text: string) => void;
    disabled: boolean;
    placeholder?: string;
}

export const ScribbleChat: React.FC<ScribbleChatProps> = ({ messages, onSendGuess, disabled, placeholder }) => {
    const [input, setInput] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const txt = input.trim();
        if (txt && !disabled) {
            onSendGuess(txt);
            setInput('');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '300px', height: '600px', background: '#222', borderRadius: '12px', overflow: 'hidden', border: '1px solid #444' }}>
            <div style={{ padding: '15px', background: '#333', fontWeight: 'bold', borderBottom: '1px solid #444', color: '#fff' }}>
                💬 Chat & Guesses
            </div>
            
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {messages.map(m => (
                    <div key={m.id} style={{
                         padding: '8px 12px',
                         borderRadius: '8px',
                         background: m.isSystem ? 'rgba(255,255,255,0.05)' : (m.isCorrect ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255,255,255,0.1)'),
                         color: m.isCorrect ? '#4ade80' : (m.isSystem ? '#aaa' : '#fff'),
                         fontSize: '0.95rem'
                    }}>
                        {!m.isSystem && <span style={{ fontWeight: 'bold', marginRight: '5px' }}>{m.sender}:</span>}
                        {m.text}
                    </div>
                ))}
            </div>
            
            <form onSubmit={handleSubmit} style={{ padding: '15px', background: '#333', borderTop: '1px solid #444', display: 'flex' }}>
                <input
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    disabled={disabled}
                    placeholder={disabled ? "Chat disabled" : (placeholder || "Type your guess...")}
                    style={{
                        flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #555',
                        background: disabled ? '#444' : '#111', color: '#fff', outline: 'none'
                    }}
                />
            </form>
        </div>
    );
};
