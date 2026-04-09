from typing import Dict, Any
from app.schemas.room import GameType


class GameService:
    """
    Game logic is primarily handled on the frontend for better performance.
    Backend only validates and broadcasts state updates.
    """
    
    @staticmethod
    def initialize_game_state(game_type: GameType, players: list) -> Dict[str, Any]:
        """Initialize game state based on game type"""
        
        if game_type == GameType.AIR_HOCKEY:
            return {
                "player1_score": 0,
                "player2_score": 0,
                "player1_id": players[0] if len(players) > 0 else None,
                "player2_id": players[1] if len(players) > 1 else None,
                "puck_position": {"x": 50, "y": 50},
                "game_started": False,
                "winner": None
            }
        
        elif game_type == GameType.BALLOON_POP:
            return {
                "scores": {p: 0 for p in players},
                "time_remaining": 60,
                "balloons": [],
                "game_started": False,
                "winner": None
            }
        
        elif game_type == GameType.CHESS:
            return {
                "white_player_id": players[0] if len(players) > 0 else None,
                "black_player_id": players[1] if len(players) > 1 else None,
                "currentTurn": "white",
                "chessBoard": None,  # Board managed on frontend
                "enPassantTarget": None,
                "lastMove": None,
                "gameOver": None,
                "game_started": True,
            }
        
        return {}
    
    @staticmethod
    def validate_game_update(game_type: GameType, current_state: Dict[str, Any], update: Dict[str, Any]) -> bool:
        """Validate game state update (basic validation)"""
        
        if game_type == GameType.AIR_HOCKEY:
            if "player1_score" in update and "player2_score" in update:
                return (
                    isinstance(update["player1_score"], int) and 
                    isinstance(update["player2_score"], int) and
                    update["player1_score"] >= 0 and
                    update["player2_score"] >= 0
                )
        
        elif game_type == GameType.BALLOON_POP:
            if "scores" in update:
                return all(isinstance(v, (int, float)) and v >= 0 for v in update["scores"].values())
        
        elif game_type == GameType.CHESS:
            # Chess logic is validated on frontend; accept all updates
            return True
        
        return True
    
    @staticmethod
    def check_game_end(game_type: GameType, game_state: Dict[str, Any]) -> tuple[bool, Any]:
        """Check if game has ended and return winner"""
        
        if game_type == GameType.AIR_HOCKEY:
            if game_state.get("player1_score", 0) >= 7:
                return True, game_state.get("player1_id")
            if game_state.get("player2_score", 0) >= 7:
                return True, game_state.get("player2_id")
        
        elif game_type == GameType.BALLOON_POP:
            if game_state.get("time_remaining", 60) <= 0:
                scores = game_state.get("scores", {})
                winner = max(scores, key=scores.get) if scores else None
                return True, winner
        
        elif game_type == GameType.CHESS:
            game_over = game_state.get("gameOver")
            if game_over:
                return True, game_over.get("winner")
        
        return False, None