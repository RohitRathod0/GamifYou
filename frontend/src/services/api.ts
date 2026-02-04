import axios from 'axios';
import { API_BASE_URL } from '@/utils/constants';

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export interface Room {
    room_code: string;
    host_id: string;
    players: Player[];
    max_players: number;
    current_game: string | null;
    game_state: Record<string, any>;
    created_at: string;
    is_active: boolean;
}

export interface Player {
    player_id: string;
    username: string;
    status: string;
    score: number;
    ready: boolean;
    joined_at: string;
}

export const roomAPI = {
    createRoom: async (username: string, maxPlayers: number = 6): Promise<Room> => {
        const response = await api.post('/api/rooms/create', { username, max_players: maxPlayers });
        return response.data;
    },

    joinRoom: async (roomCode: string, username: string): Promise<Room> => {
        const response = await api.post('/api/rooms/join', { room_code: roomCode, username });
        return response.data;
    },

    getRoom: async (roomCode: string): Promise<Room> => {
        const response = await api.get(`/api/rooms/${roomCode}`);
        return response.data;
    },

    getActiveRooms: async (): Promise<string[]> => {
        const response = await api.get('/api/rooms/');
        return response.data;
    },

    leaveRoom: async (roomCode: string, playerId: string): Promise<void> => {
        await api.delete(`/api/rooms/${roomCode}/${playerId}`);
    },
};

export default api;