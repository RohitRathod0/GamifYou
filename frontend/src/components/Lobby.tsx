import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { roomAPI } from '@/services/api';

interface LobbyProps {
    appState: any;
    setAppState: React.Dispatch<React.SetStateAction<any>>;
}

export const Lobby: React.FC<LobbyProps> = ({ setAppState }) => {
    const navigate = useNavigate();
    const [username, setUsername] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleCreateRoom = async () => {
        if (!username.trim()) {
            setError('Please enter a username');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const room = await roomAPI.createRoom(username);
            setAppState({
                username,
                roomCode: room.room_code,
                playerId: room.host_id,
                currentGame: null,
            });
            // Navigate to room page after successful creation
            navigate('/room');
        } catch (err) {
            setError('Failed to create room. Please try again.');
            console.error('Error creating room:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleJoinRoom = async () => {
        if (!username.trim() || !roomCode.trim()) {
            setError('Please enter username and room code');
            return;
        }

        setIsLoading(true);
        setError('');

        try {
            const room = await roomAPI.joinRoom(roomCode, username);
            const player = room.players.find(p => p.username === username);

            setAppState({
                username,
                roomCode: room.room_code,
                playerId: player?.player_id || '',
                currentGame: room.current_game,
            });
            // Navigate to room page after successful join
            navigate('/room');
        } catch (err) {
            setError('Failed to join room. Please check the room code.');
            console.error('Error joining room:', err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '20px'
        }}>
            <div style={{
                backgroundColor: '#1a1a1a',
                padding: '40px',
                borderRadius: '12px',
                maxWidth: '400px',
                width: '100%',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <h1 style={{ fontSize: '2.5rem', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                        <span>🎮</span> GestureHub
                    </h1>
                    <p style={{ color: '#888', fontSize: '0.9rem' }}>Play games with hand gestures!</p>
                </div>

                {error && (
                    <div style={{
                        backgroundColor: '#ff4444',
                        color: 'white',
                        padding: '12px',
                        borderRadius: '6px',
                        marginBottom: '20px',
                        fontSize: '0.9rem'
                    }}>
                        {error}
                    </div>
                )}

                <div style={{ marginBottom: '30px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#ccc' }}>
                        Username
                    </label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter your username"
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '6px',
                            border: '1px solid #333',
                            backgroundColor: '#0a0a0a',
                            color: 'white',
                            fontSize: '1rem',
                            boxSizing: 'border-box'
                        }}
                        disabled={isLoading}
                    />
                </div>

                <button
                    onClick={handleCreateRoom}
                    disabled={isLoading}
                    style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: isLoading ? '#555' : '#4CAF50',
                        color: 'white',
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        marginBottom: '20px',
                        transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#45a049')}
                    onMouseOut={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#4CAF50')}
                >
                    {isLoading ? 'Creating...' : 'Create Room'}
                </button>

                <div style={{ textAlign: 'center', margin: '20px 0', color: '#666' }}>
                    OR
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: '#ccc' }}>
                        Room Code
                    </label>
                    <input
                        type="text"
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                        placeholder="Enter room code"
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '6px',
                            border: '1px solid #333',
                            backgroundColor: '#0a0a0a',
                            color: 'white',
                            fontSize: '1rem',
                            boxSizing: 'border-box',
                            textTransform: 'uppercase'
                        }}
                        disabled={isLoading}
                    />
                </div>

                <button
                    onClick={handleJoinRoom}
                    disabled={isLoading}
                    style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: isLoading ? '#555' : '#2196F3',
                        color: 'white',
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#0b7dda')}
                    onMouseOut={(e) => !isLoading && (e.currentTarget.style.backgroundColor = '#2196F3')}
                >
                    {isLoading ? 'Joining...' : 'Join Room'}
                </button>

                <div style={{ textAlign: 'center', margin: '30px 0', color: '#666', fontSize: '0.9rem' }}>
                    — OR TRY NEW FEATURES —
                </div>

                <button
                    onClick={() => navigate('/face-swap')}
                    style={{
                        width: '100%',
                        padding: '14px',
                        borderRadius: '6px',
                        border: '2px solid #667eea',
                        backgroundColor: 'transparent',
                        color: '#667eea',
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'all 0.3s',
                        background: 'linear-gradient(135deg, #667eea15 0%, #764ba215 100%)'
                    }}
                    onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = '#667eea';
                        e.currentTarget.style.color = 'white';
                    }}
                    onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = '#667eea';
                    }}
                >
                    🎭 Face Swap Demo (Day 1)
                </button>
            </div>
        </div>
    );
};
