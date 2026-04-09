from fastapi import APIRouter, HTTPException, status
from app.schemas.room import (
    CreateRoomRequest,
    JoinRoomRequest,
    Room,
    RoomSummary,
)
from app.services.room_service import RoomService
import uuid

router = APIRouter(prefix="/api/rooms", tags=["rooms"])


@router.get("/", response_model=list[str])
async def get_active_rooms():
    """Get all active room codes"""
    rooms = await RoomService.get_active_rooms()
    return rooms


@router.post("/create", response_model=Room, status_code=status.HTTP_201_CREATED)
async def create_room(request: CreateRoomRequest):
    """Create a new game room"""
    player_id = str(uuid.uuid4())
    room = await RoomService.create_room(
        host_id=player_id,
        username=request.username,
        max_players=request.max_players,
        is_public=request.is_public,
    )
    return room


# ⚠️ IMPORTANT: This route MUST be defined BEFORE /{room_code} so FastAPI
# does not match the literal string 'public' as a room_code parameter.
@router.get("/public", response_model=list[RoomSummary])
async def get_public_rooms():
    """Return all joinable public rooms for the lobby."""
    rooms = await RoomService.get_public_rooms()
    return rooms


@router.post("/join", response_model=Room)
async def join_room(request: JoinRoomRequest):
    """Join an existing room"""
    player_id = str(uuid.uuid4())
    room_code = request.room_code.upper().strip()

    # Check if room exists first
    existing = await RoomService.get_room(room_code)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Room '{room_code}' not found. Check the code and try again."
        )

    if len(existing.players) >= existing.max_players:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Room is full."
        )

    room = await RoomService.join_room(
        room_code=room_code,
        player_id=player_id,
        username=request.username
    )
    return room


@router.get("/{room_code}", response_model=Room)
async def get_room(room_code: str):
    """Get room details"""
    code = room_code.upper().strip()
    room = await RoomService.get_room(code)
    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    return room


@router.delete("/{room_code}/{player_id}")
async def leave_room(room_code: str, player_id: str):
    """Leave a room"""
    code = room_code.upper().strip()
    room = await RoomService.leave_room(code, player_id)
    return {"message": "Left room successfully", "room": room}

