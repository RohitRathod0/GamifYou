from typing import Dict, Any
from app.models import GameType


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
        
        elif game_type == GameType.PICTIONARY:
            return {
                "current_drawer": players[0] if players else None,
                "drawer_index": 0,
                "current_word": None,
                "guessed_players": [],
                "round": 1,
                "max_rounds": len(players),
                "time_remaining": 45,
                "scores": {p: 0 for p in players}
            }
        
        elif game_type == GameType.LASER_DODGER:
            return {
                "alive_players": players.copy(),
                "player_health": {p: 100 for p in players},
                "lasers": [],
                "game_speed": 1.0,
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
        
        return {}
    
    @staticmethod
    def validate_game_update(game_type: GameType, current_state: Dict[str, Any], update: Dict[str, Any]) -> bool:
        """Validate game state update (basic validation)"""
        
        # Basic validation - can be expanded
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
        
        # Add more validation as needed
        return True
    
    @staticmethod
    def check_game_end(game_type: GameType, game_state: Dict[str, Any]) -> tuple[bool, Any]:
        """Check if game has ended and return winner"""
        
        if game_type == GameType.AIR_HOCKEY:
            if game_state.get("player1_score", 0) >= 7:
                return True, game_state.get("player1_id")
            if game_state.get("player2_score", 0) >= 7:
                return True, game_state.get("player2_id")
        
        elif game_type == GameType.PICTIONARY:
            if game_state.get("round", 1) > game_state.get("max_rounds", 1):
                scores = game_state.get("scores", {})
                winner = max(scores, key=scores.get) if scores else None
                return True, winner
        
        elif game_type == GameType.LASER_DODGER:
            alive = game_state.get("alive_players", [])
            if len(alive) <= 1:
                return True, alive[0] if alive else None
        
        elif game_type == GameType.BALLOON_POP:
            if game_state.get("time_remaining", 60) <= 0:
                scores = game_state.get("scores", {})
                winner = max(scores, key=scores.get) if scores else None
                return True, winner
        
        return False, None