"""
GestureHub Backend — WebSocket Router

Handles real-time bidirectional communication with game clients.

Message Protocol
----------------
Client → Server:
  LANDMARK_FRAME  {type, player_id, landmarks: [...21], handedness, timestamp_ms}
  GAME_ACTION     {type, player_id, action, payload}
  PLAYER_READY    {type, player_id, ready: bool}
  GAME_SELECTED   {type, player_id, game_type}
  GAME_START      {type, player_id}
  GAME_STATE_UPDATE {type, player_id, state: {...}}
  WEBRTC_OFFER / WEBRTC_ANSWER / WEBRTC_ICE_CANDIDATE
  CHAT_MESSAGE    {type, player_id, message, username}

Server → Client:
  CONNECT         Sent on successful connection
  GESTURE_RESULT  {type, player_id, gesture, confidence, game_action, ...}
  GAME_STATE_UPDATE, GAME_END, PLAYER_JOINED, PLAYER_LEFT, ERROR
"""
from __future__ import annotations

import json
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models import GameType, WSMessageType
from app.services.game_service import GameService
from app.services.gesture_pipeline import GesturePipeline
from app.services.room_service import RoomService

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Pipeline Registry ─────────────────────────────────────────────────────────
# Keyed by "room_code:player_id" — one pipeline per player per room
_gesture_pipelines: Dict[str, GesturePipeline] = {}


# ── Connection Manager ────────────────────────────────────────────────────────


class ConnectionManager:
    """Manages active WebSocket connections grouped by room.

    Provides connect, disconnect, personal message, and room broadcast methods.
    """

    def __init__(self) -> None:
        """Initialise with an empty connection registry."""
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(
        self, websocket: WebSocket, room_code: str, player_id: str
    ) -> None:
        """Accept a WebSocket connection and register the player.

        Args:
            websocket: The incoming WebSocket connection.
            room_code: Room the player is joining.
            player_id: Unique identifier for the player.
        """
        await websocket.accept()
        self.active_connections.setdefault(room_code, {})[player_id] = websocket
        logger.info("Player %s connected to room %s", player_id, room_code)

    def disconnect(self, room_code: str, player_id: str) -> None:
        """Remove a player from the connection registry.

        Cleans up empty rooms automatically. Also tears down the
        associated gesture pipeline to free memory.

        Args:
            room_code: Room the player is leaving.
            player_id: Player to remove.
        """
        if room_code in self.active_connections:
            self.active_connections[room_code].pop(player_id, None)
            logger.info("Player %s disconnected from room %s", player_id, room_code)
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]

        # Clean up gesture pipeline
        pipeline_key = f"{room_code}:{player_id}"
        _gesture_pipelines.pop(pipeline_key, None)

    async def send_personal_message(
        self, message: dict, room_code: str, player_id: str
    ) -> None:
        """Send a JSON message to a specific player.

        Args:
            message: Dict that will be JSON-serialised.
            room_code: Room the player is in.
            player_id: Target player.
        """
        conn_map = self.active_connections.get(room_code, {})
        ws = conn_map.get(player_id)
        if ws:
            await ws.send_json(message)

    async def broadcast_to_room(
        self,
        message: dict,
        room_code: str,
        exclude_player: Optional[str] = None,
    ) -> None:
        """Broadcast a JSON message to all players in a room.

        Silently cleans up any players whose connections have dropped.

        Args:
            message: Dict that will be JSON-serialised.
            room_code: Target room.
            exclude_player: Optional player_id to skip (e.g. sender).
        """
        if room_code not in self.active_connections:
            return

        disconnected: List[str] = []
        for pid, ws in self.active_connections[room_code].items():
            if pid == exclude_player:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                logger.warning("Failed to send to %s; marking for removal", pid)
                disconnected.append(pid)

        for pid in disconnected:
            self.disconnect(room_code, pid)


manager = ConnectionManager()


# ── WebSocket Endpoint ────────────────────────────────────────────────────────


@router.websocket("/ws/{room_code}/{player_id}")
async def websocket_endpoint(
    websocket: WebSocket, room_code: str, player_id: str
) -> None:
    """Primary WebSocket endpoint for real-time game communication.

    Accepts landmark frames, game state updates, WebRTC signalling,
    and chat messages from connected players.

    Args:
        websocket: The WebSocket connection.
        room_code: Unique code identifying the game room.
        player_id: Unique identifier for the connecting player.
    """
    room_code = room_code.upper().strip()
    await manager.connect(websocket, room_code, player_id)

    # Create a gesture pipeline for this player session
    pipeline_key = f"{room_code}:{player_id}"
    _gesture_pipelines[pipeline_key] = GesturePipeline(player_id)

    # Confirm connection to the joining player
    await manager.send_personal_message(
        {
            "type": WSMessageType.CONNECT,
            "data": {
                "player_id": player_id,
                "room_code": room_code,
                "message": "Connected to GestureHub",
            },
        },
        room_code,
        player_id,
    )

    # Announce arrival to existing players
    await manager.broadcast_to_room(
        {
            "type": WSMessageType.PLAYER_JOINED,
            "data": {"player_id": player_id, "room_code": room_code},
        },
        room_code,
        exclude_player=player_id,
    )

    try:
        while True:
            data = await websocket.receive_text()
            message: dict = json.loads(data)
            message_type: str = message.get("type", "")
            message_data: dict = message.get("data", {})

            # ── LANDMARK_FRAME — route through CV pipeline ────────────────
            if message_type == "LANDMARK_FRAME":
                raw_landmarks: List[dict] = message_data.get("landmarks", [])
                if len(raw_landmarks) != 21:
                    await manager.send_personal_message(
                        {
                            "type": "ERROR",
                            "data": {
                                "code": "INVALID_LANDMARKS",
                                "message": "Expected exactly 21 landmark points.",
                            },
                        },
                        room_code,
                        player_id,
                    )
                    continue

                pipeline = _gesture_pipelines.get(pipeline_key)
                if pipeline:
                    result = pipeline.process(raw_landmarks)
                    # Only broadcast when a stable gesture is confirmed
                    if result.get("stable_gesture"):
                        await manager.broadcast_to_room(
                            {
                                "type": "GESTURE_RESULT",
                                "data": {
                                    "player_id": player_id,
                                    "gesture": result["stable_gesture"],
                                    "confidence": result["confidence"],
                                    "game_action": result["game_action"],
                                    "finger_states": result["finger_states"],
                                    "processing_time_ms": result["processing_time_ms"],
                                },
                            },
                            room_code,
                        )
                    # Always echo raw gesture back to the sender (for debug overlay)
                    await manager.send_personal_message(
                        {
                            "type": "GESTURE_RESULT",
                            "data": {
                                "player_id": player_id,
                                "raw_gesture": result["raw_gesture"],
                                "stable_gesture": result.get("stable_gesture"),
                                "confidence": result["confidence"],
                                "game_action": result.get("game_action"),
                                "finger_states": result["finger_states"],
                                "processing_time_ms": result["processing_time_ms"],
                            },
                        },
                        room_code,
                        player_id,
                    )

            # ── PLAYER_READY ──────────────────────────────────────────────
            elif message_type == WSMessageType.PLAYER_READY:
                ready: bool = message_data.get("ready", False)
                room = await RoomService.set_player_ready(room_code, player_id, ready)
                await manager.broadcast_to_room(
                    {
                        "type": WSMessageType.PLAYER_READY,
                        "data": {
                            "player_id": player_id,
                            "ready": ready,
                            "room": room.model_dump(mode="json") if room else None,
                        },
                    },
                    room_code,
                )

            # ── GAME_SELECTED ─────────────────────────────────────────────
            elif message_type == WSMessageType.GAME_SELECTED:
                game_type = GameType(message_data.get("game_type"))
                room = await RoomService.select_game(room_code, game_type)
                if room:
                    player_ids = [p.player_id for p in room.players]
                    initial_state = GameService.initialize_game_state(game_type, player_ids)
                    await RoomService.update_game_state(room_code, initial_state)
                    await manager.broadcast_to_room(
                        {
                            "type": WSMessageType.GAME_SELECTED,
                            "data": {
                                "game_type": game_type.value,
                                "initial_state": initial_state,
                            },
                        },
                        room_code,
                    )

            # ── GAME_START ────────────────────────────────────────────────
            elif message_type == WSMessageType.GAME_START:
                await manager.broadcast_to_room(
                    {"type": WSMessageType.GAME_START, "data": message_data},
                    room_code,
                )

            # ── GAME_STATE_UPDATE ─────────────────────────────────────────
            elif message_type == WSMessageType.GAME_STATE_UPDATE:
                state_update: dict = message_data.get("state", {})
                room = await RoomService.get_room(room_code)
                if room and room.current_game:
                    is_valid: bool = GameService.validate_game_update(
                        room.current_game, room.game_state, state_update
                    )
                    if is_valid:
                        new_state: dict = {**room.game_state, **state_update}
                        await RoomService.update_game_state(room_code, new_state)
                        game_ended, winner = GameService.check_game_end(
                            room.current_game, new_state
                        )
                        if game_ended:
                            await manager.broadcast_to_room(
                                {
                                    "type": WSMessageType.GAME_END,
                                    "data": {"winner": winner, "final_state": new_state},
                                },
                                room_code,
                            )
                        else:
                            await manager.broadcast_to_room(
                                {
                                    "type": WSMessageType.GAME_STATE_UPDATE,
                                    "data": {
                                        "player_id": player_id,
                                        "state": new_state,
                                    },
                                },
                                room_code,
                                exclude_player=player_id,
                            )

            # ── WebRTC Signalling ─────────────────────────────────────────
            elif message_type == WSMessageType.WEBRTC_OFFER:
                target = message_data.get("target_player_id")
                if target:
                    await manager.send_personal_message(
                        {
                            "type": WSMessageType.WEBRTC_OFFER,
                            "data": {
                                "from_player_id": player_id,
                                "offer": message_data.get("offer"),
                            },
                        },
                        room_code,
                        target,
                    )

            elif message_type == WSMessageType.WEBRTC_ANSWER:
                target = message_data.get("target_player_id")
                if target:
                    await manager.send_personal_message(
                        {
                            "type": WSMessageType.WEBRTC_ANSWER,
                            "data": {
                                "from_player_id": player_id,
                                "answer": message_data.get("answer"),
                            },
                        },
                        room_code,
                        target,
                    )

            elif message_type == WSMessageType.WEBRTC_ICE_CANDIDATE:
                target = message_data.get("target_player_id")
                if target:
                    await manager.send_personal_message(
                        {
                            "type": WSMessageType.WEBRTC_ICE_CANDIDATE,
                            "data": {
                                "from_player_id": player_id,
                                "candidate": message_data.get("candidate"),
                            },
                        },
                        room_code,
                        target,
                    )

            # ── CHAT_MESSAGE ──────────────────────────────────────────────
            elif message_type == WSMessageType.CHAT_MESSAGE:
                await manager.broadcast_to_room(
                    {
                        "type": WSMessageType.CHAT_MESSAGE,
                        "data": {
                            "player_id": player_id,
                            "message": message_data.get("message", ""),
                            "username": message_data.get("username", "Unknown"),
                        },
                    },
                    room_code,
                )

    except WebSocketDisconnect:
        manager.disconnect(room_code, player_id)
        await RoomService.leave_room(room_code, player_id)
        await manager.broadcast_to_room(
            {
                "type": WSMessageType.PLAYER_LEFT,
                "data": {"player_id": player_id, "room_code": room_code},
            },
            room_code,
        )
        logger.info("WebSocket disconnected: %s from %s", player_id, room_code)

    except Exception as exc:
        logger.error("WebSocket error for %s: %s", player_id, exc)
        manager.disconnect(room_code, player_id)