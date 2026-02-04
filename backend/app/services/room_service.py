import random
import string
from typing import Optional, List
from app.models import Room, Player, PlayerStatus, GameType
from app.database import db
from app.config import settings
from datetime import datetime


class RoomService:
    @staticmethod
    def generate_room_code() -> str:
        """Generate a unique 6-character room code"""
        return ''.join(random.choices(string.ascii_uppercase + string.digits, k=settings.ROOM_CODE_LENGTH))
    
    @staticmethod
    async def create_room(host_id: str, username: str, max_players: int = 6) -> Room:
        """Create a new game room"""
        # Generate unique room code
        while True:
            room_code = RoomService.generate_room_code()
            if not await db.exists(f"room:{room_code}"):
                break
        
        # Create host player
        host = Player(
            player_id=host_id,
            username=username,
            status=PlayerStatus.CONNECTED
        )
        
        # Create room
        room = Room(
            room_code=room_code,
            host_id=host_id,
            players=[host],
            max_players=max_players
        )
        
        # Save to Redis
        await db.set(f"room:{room_code}", room.model_dump(mode='json'), expire=3600)  # 1 hour expiry
        await db.set_add("active_rooms", room_code)
        await db.set_add(f"room:{room_code}:players", host_id)
        
        return room
    
    @staticmethod
    async def get_room(room_code: str) -> Optional[Room]:
        """Get room by code"""
        room_data = await db.get(f"room:{room_code}")
        if room_data:
            return Room(**room_data)
        return None
    
    @staticmethod
    async def join_room(room_code: str, player_id: str, username: str) -> Optional[Room]:
        """Add a player to a room"""
        room = await RoomService.get_room(room_code)
        
        if not room:
            return None
        
        if len(room.players) >= room.max_players:
            return None
        
        # Check if player already in room
        if any(p.player_id == player_id for p in room.players):
            return room
        
        # Add new player
        new_player = Player(
            player_id=player_id,
            username=username,
            status=PlayerStatus.CONNECTED
        )
        room.players.append(new_player)
        
        # Update Redis
        await db.set(f"room:{room_code}", room.model_dump(mode='json'), expire=3600)
        await db.set_add(f"room:{room_code}:players", player_id)
        
        return room
    
    @staticmethod
    async def leave_room(room_code: str, player_id: str) -> Optional[Room]:
        """Remove a player from a room"""
        room = await RoomService.get_room(room_code)
        
        if not room:
            return None
        
        # Remove player
        room.players = [p for p in room.players if p.player_id != player_id]
        
        # If room is empty, delete it
        if not room.players:
            await db.delete(f"room:{room_code}")
            await db.set_remove("active_rooms", room_code)
            await db.delete(f"room:{room_code}:players")
            return None
        
        # If host left, assign new host
        if room.host_id == player_id and room.players:
            room.host_id = room.players[0].player_id
        
        # Update Redis
        await db.set(f"room:{room_code}", room.model_dump(mode='json'), expire=3600)
        await db.set_remove(f"room:{room_code}:players", player_id)
        
        return room
    
    @staticmethod
    async def update_player_status(room_code: str, player_id: str, status: PlayerStatus) -> Optional[Room]:
        """Update a player's status"""
        room = await RoomService.get_room(room_code)
        
        if not room:
            return None
        
        for player in room.players:
            if player.player_id == player_id:
                player.status = status
                break
        
        await db.set(f"room:{room_code}", room.model_dump(mode='json'), expire=3600)
        return room
    
    @staticmethod
    async def set_player_ready(room_code: str, player_id: str, ready: bool) -> Optional[Room]:
        """Set player ready status"""
        room = await RoomService.get_room(room_code)
        
        if not room:
            return None
        
        for player in room.players:
            if player.player_id == player_id:
                player.ready = ready
                break
        
        await db.set(f"room:{room_code}", room.model_dump(mode='json'), expire=3600)
        return room
    
    @staticmethod
    async def select_game(room_code: str, game_type: GameType) -> Optional[Room]:
        """Select a game for the room"""
        room = await RoomService.get_room(room_code)
        
        if not room:
            return None
        
        room.current_game = game_type
        room.game_state = {}
        
        await db.set(f"room:{room_code}", room.model_dump(mode='json'), expire=3600)
        return room
    
    @staticmethod
    async def update_game_state(room_code: str, game_state: dict) -> Optional[Room]:
        """Update game state"""
        room = await RoomService.get_room(room_code)
        
        if not room:
            return None
        
        room.game_state = game_state
        
        await db.set(f"room:{room_code}", room.model_dump(mode='json'), expire=3600)
        return room
    
    @staticmethod
    async def get_active_rooms() -> List[str]:
        """Get all active room codes"""
        rooms = await db.set_members("active_rooms")
        return list(rooms) if rooms else []