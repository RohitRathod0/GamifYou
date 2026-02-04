from fastapi import APIRouter, HTTPException, status
from app.models import CreateRoomRequest, JoinRoomRequest, Room
from app.services.room_service import RoomService
import uuid

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


@router.post("/create", response_model=Room, status_code=status.HTTP_201_CREATED)
async def create_room(request: CreateRoomRequest):
    """Create a new game room"""
    player_id = str(uuid.uuid4())
    
    room = await RoomService.create_room(
        host_id=player_id,
        username=request.username,
        max_players=request.max_players
    )
    
    return room


@router.post("/join", response_model=Room)
async def join_room(request: JoinRoomRequest):
    """Join an existing room"""
    player_id = str(uuid.uuid4())
    
    room = await RoomService.join_room(
        room_code=request.room_code,
        player_id=player_id,
        username=request.username
    )
    
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found or full"
        )
    
    return room


@router.get("/{room_code}", response_model=Room)
async def get_room(room_code: str):
    """Get room details"""
    room = await RoomService.get_room(room_code)
    
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    
    return room


@router.get("/", response_model=list[str])
async def get_active_rooms():
    """Get all active room codes"""
    rooms = await RoomService.get_active_rooms()
    return rooms


@router.delete("/{room_code}/{player_id}")
async def leave_room(room_code: str, player_id: str):
    """Leave a room"""
    room = await RoomService.leave_room(room_code, player_id)
    
    return {"message": "Left room successfully", "room": room}