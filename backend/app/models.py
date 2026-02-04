from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


class GameType(str, Enum):
    AIR_HOCKEY = "air_hockey"
    PICTIONARY = "pictionary"
    LASER_DODGER = "laser_dodger"
    BALLOON_POP = "balloon_pop"


class PlayerStatus(str, Enum):
    CONNECTED = "connected"
    READY = "ready"
    PLAYING = "playing"
    DISCONNECTED = "disconnected"


class Player(BaseModel):
    player_id: str
    username: str
    status: PlayerStatus = PlayerStatus.CONNECTED
    score: int = 0
    ready: bool = False
    joined_at: datetime = Field(default_factory=datetime.now)


class Room(BaseModel):
    room_code: str
    host_id: str
    players: List[Player] = []
    max_players: int = 6
    current_game: Optional[GameType] = None
    game_state: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=datetime.now)
    is_active: bool = True


class CreateRoomRequest(BaseModel):
    username: str
    max_players: int = Field(default=6, ge=2, le=6)


class JoinRoomRequest(BaseModel):
    room_code: str
    username: str


class GameStateUpdate(BaseModel):
    room_code: str
    player_id: str
    game_type: GameType
    state: Dict[str, Any]


class WebSocketMessage(BaseModel):
    type: str
    data: Dict[str, Any]
    timestamp: datetime = Field(default_factory=datetime.now)


# WebSocket message types
class WSMessageType(str, Enum):
    # Connection
    CONNECT = "connect"
    DISCONNECT = "disconnect"
    
    # Room events
    PLAYER_JOINED = "player_joined"
    PLAYER_LEFT = "player_left"
    PLAYER_READY = "player_ready"
    
    # Game events
    GAME_SELECTED = "game_selected"
    GAME_START = "game_start"
    GAME_STATE_UPDATE = "game_state_update"
    GAME_END = "game_end"
    
    # WebRTC signaling
    WEBRTC_OFFER = "webrtc_offer"
    WEBRTC_ANSWER = "webrtc_answer"
    WEBRTC_ICE_CANDIDATE = "webrtc_ice_candidate"
    
    # Chat
    CHAT_MESSAGE = "chat_message"
    
    # Errors
    ERROR = "error"