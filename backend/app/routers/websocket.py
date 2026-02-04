from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json
from app.models import WSMessageType, GameType
from app.services.room_service import RoomService
from app.services.game_service import GameService
import asyncio

router = APIRouter()

# Store active WebSocket connections
# Format: {room_code: {player_id: websocket}}
active_connections: Dict[str, Dict[str, WebSocket]] = {}


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, room_code: str, player_id: str):
        """Connect a player to a room"""
        await websocket.accept()
        
        if room_code not in self.active_connections:
            self.active_connections[room_code] = {}
        
        self.active_connections[room_code][player_id] = websocket
        print(f"✅ Player {player_id} connected to room {room_code}")
    
    def disconnect(self, room_code: str, player_id: str):
        """Disconnect a player from a room"""
        if room_code in self.active_connections:
            if player_id in self.active_connections[room_code]:
                del self.active_connections[room_code][player_id]
                print(f"❌ Player {player_id} disconnected from room {room_code}")
            
            # Clean up empty rooms
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]
    
    async def send_personal_message(self, message: dict, room_code: str, player_id: str):
        """Send message to a specific player"""
        if room_code in self.active_connections:
            if player_id in self.active_connections[room_code]:
                websocket = self.active_connections[room_code][player_id]
                await websocket.send_json(message)
    
    async def broadcast_to_room(self, message: dict, room_code: str, exclude_player: str = None):
        """Broadcast message to all players in a room"""
        if room_code in self.active_connections:
            disconnected = []
            
            for player_id, websocket in self.active_connections[room_code].items():
                if player_id != exclude_player:
                    try:
                        await websocket.send_json(message)
                    except Exception as e:
                        print(f"Error sending to {player_id}: {e}")
                        disconnected.append(player_id)
            
            # Clean up disconnected players
            for player_id in disconnected:
                self.disconnect(room_code, player_id)


manager = ConnectionManager()


@router.websocket("/ws/{room_code}/{player_id}")
async def websocket_endpoint(websocket: WebSocket, room_code: str, player_id: str):
    """WebSocket endpoint for real-time communication"""
    
    await manager.connect(websocket, room_code, player_id)
    
    # Send connection confirmation
    await manager.send_personal_message({
        "type": WSMessageType.CONNECT,
        "data": {
            "player_id": player_id,
            "room_code": room_code,
            "message": "Connected successfully"
        }
    }, room_code, player_id)
    
    # Notify other players
    await manager.broadcast_to_room({
        "type": WSMessageType.PLAYER_JOINED,
        "data": {
            "player_id": player_id,
            "room_code": room_code
        }
    }, room_code, exclude_player=player_id)
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            message_type = message.get("type")
            message_data = message.get("data", {})
            
            # Handle different message types
            if message_type == WSMessageType.PLAYER_READY:
                # Update player ready status
                ready = message_data.get("ready", False)
                room = await RoomService.set_player_ready(room_code, player_id, ready)
                
                # Broadcast to all players
                await manager.broadcast_to_room({
                    "type": WSMessageType.PLAYER_READY,
                    "data": {
                        "player_id": player_id,
                        "ready": ready,
                        "room": room.model_dump(mode='json') if room else None
                    }
                }, room_code)
            
            elif message_type == WSMessageType.GAME_SELECTED:
                # Host selects a game
                game_type = GameType(message_data.get("game_type"))
                room = await RoomService.select_game(room_code, game_type)
                
                if room:
                    # Initialize game state
                    player_ids = [p.player_id for p in room.players]
                    initial_state = GameService.initialize_game_state(game_type, player_ids)
                    await RoomService.update_game_state(room_code, initial_state)
                    
                    # Broadcast game selection
                    await manager.broadcast_to_room({
                        "type": WSMessageType.GAME_SELECTED,
                        "data": {
                            "game_type": game_type.value,
                            "initial_state": initial_state
                        }
                    }, room_code)
            
            elif message_type == WSMessageType.GAME_START:
                # Start the game
                await manager.broadcast_to_room({
                    "type": WSMessageType.GAME_START,
                    "data": message_data
                }, room_code)
            
            elif message_type == WSMessageType.GAME_STATE_UPDATE:
                # Update game state
                state_update = message_data.get("state", {})
                
                # Validate update
                room = await RoomService.get_room(room_code)
                if room and room.current_game:
                    is_valid = GameService.validate_game_update(
                        room.current_game,
                        room.game_state,
                        state_update
                    )
                    
                    if is_valid:
                        # Merge state update
                        new_state = {**room.game_state, **state_update}
                        await RoomService.update_game_state(room_code, new_state)
                        
                        # Check if game ended
                        game_ended, winner = GameService.check_game_end(room.current_game, new_state)
                        
                        if game_ended:
                            await manager.broadcast_to_room({
                                "type": WSMessageType.GAME_END,
                                "data": {
                                    "winner": winner,
                                    "final_state": new_state
                                }
                            }, room_code)
                        else:
                            # Broadcast state update
                            await manager.broadcast_to_room({
                                "type": WSMessageType.GAME_STATE_UPDATE,
                                "data": {
                                    "player_id": player_id,
                                    "state": new_state
                                }
                            }, room_code, exclude_player=player_id)
            
            elif message_type == WSMessageType.WEBRTC_OFFER:
                # Forward WebRTC offer to specific player
                target_player = message_data.get("target_player_id")
                if target_player:
                    await manager.send_personal_message({
                        "type": WSMessageType.WEBRTC_OFFER,
                        "data": {
                            "from_player_id": player_id,
                            "offer": message_data.get("offer")
                        }
                    }, room_code, target_player)
            
            elif message_type == WSMessageType.WEBRTC_ANSWER:
                # Forward WebRTC answer to specific player
                target_player = message_data.get("target_player_id")
                if target_player:
                    await manager.send_personal_message({
                        "type": WSMessageType.WEBRTC_ANSWER,
                        "data": {
                            "from_player_id": player_id,
                            "answer": message_data.get("answer")
                        }
                    }, room_code, target_player)
            
            elif message_type == WSMessageType.WEBRTC_ICE_CANDIDATE:
                # Forward ICE candidate to specific player
                target_player = message_data.get("target_player_id")
                if target_player:
                    await manager.send_personal_message({
                        "type": WSMessageType.WEBRTC_ICE_CANDIDATE,
                        "data": {
                            "from_player_id": player_id,
                            "candidate": message_data.get("candidate")
                        }
                    }, room_code, target_player)
            
            elif message_type == WSMessageType.CHAT_MESSAGE:
                # Broadcast chat message
                await manager.broadcast_to_room({
                    "type": WSMessageType.CHAT_MESSAGE,
                    "data": {
                        "player_id": player_id,
                        "message": message_data.get("message", ""),
                        "username": message_data.get("username", "Unknown")
                    }
                }, room_code)
            
    except WebSocketDisconnect:
        manager.disconnect(room_code, player_id)
        
        # Remove player from room
        await RoomService.leave_room(room_code, player_id)
        
        # Notify other players
        await manager.broadcast_to_room({
            "type": WSMessageType.PLAYER_LEFT,
            "data": {
                "player_id": player_id,
                "room_code": room_code
            }
        }, room_code)
        
        print(f"🔌 WebSocket disconnected: {player_id} from {room_code}")
    
    except Exception as e:
        print(f"❌ WebSocket error: {e}")
        manager.disconnect(room_code, player_id)