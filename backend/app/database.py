import redis.asyncio as redis
from app.config import settings
import json
from typing import Optional, Any, Dict
import logging

logger = logging.getLogger(__name__)


class RedisDB:
    def __init__(self):
        self.redis: Optional[redis.Redis] = None
        self.use_memory_fallback = False
        self._memory_store: Dict[str, str] = {}  # In-memory fallback
    
    async def connect(self):
        """Connect to Redis with fallback to in-memory storage"""
        try:
            self.redis = await redis.from_url(
                f"redis://{settings.REDIS_HOST}:{settings.REDIS_PORT}/{settings.REDIS_DB}",
                password=settings.REDIS_PASSWORD,
                encoding="utf-8",
                decode_responses=True
            )
            # Test connection
            await self.redis.ping()
            print("✅ Connected to Redis")
            self.use_memory_fallback = False
        except Exception as e:
            print(f"⚠️  Redis connection failed: {e}")
            print("⚠️  Using in-memory storage (data will be lost on restart)")
            self.use_memory_fallback = True
            self.redis = None
    
    async def disconnect(self):
        """Disconnect from Redis"""
        if self.redis and not self.use_memory_fallback:
            await self.redis.close()
            print("❌ Disconnected from Redis")
        else:
            print("❌ Cleared in-memory storage")
            self._memory_store.clear()
    
    async def set(self, key: str, value: Any, expire: int = None):
        """Set a key-value pair"""
        if self.use_memory_fallback:
            self._memory_store[key] = json.dumps(value) if isinstance(value, (dict, list)) else str(value)
        else:
            if isinstance(value, (dict, list)):
                value = json.dumps(value)
            await self.redis.set(key, value, ex=expire)
    
    async def get(self, key: str) -> Optional[Any]:
        """Get a value by key"""
        if self.use_memory_fallback:
            value = self._memory_store.get(key)
        else:
            value = await self.redis.get(key)
        
        if value:
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return value
        return None
    
    async def delete(self, key: str):
        """Delete a key"""
        if self.use_memory_fallback:
            self._memory_store.pop(key, None)
        else:
            await self.redis.delete(key)
    
    async def exists(self, key: str) -> bool:
        """Check if key exists"""
        if self.use_memory_fallback:
            return key in self._memory_store
        else:
            return await self.redis.exists(key) > 0
    
    async def set_add(self, key: str, *values):
        """Add values to a set"""
        if self.use_memory_fallback:
            current = self._memory_store.get(key, '[]')
            current_set = set(json.loads(current))
            current_set.update(values)
            self._memory_store[key] = json.dumps(list(current_set))
        else:
            await self.redis.sadd(key, *values)
    
    async def set_remove(self, key: str, *values):
        """Remove values from a set"""
        if self.use_memory_fallback:
            current = self._memory_store.get(key, '[]')
            current_set = set(json.loads(current))
            current_set.difference_update(values)
            self._memory_store[key] = json.dumps(list(current_set))
        else:
            await self.redis.srem(key, *values)
    
    async def set_members(self, key: str):
        """Get all members of a set"""
        if self.use_memory_fallback:
            current = self._memory_store.get(key, '[]')
            return set(json.loads(current))
        else:
            return await self.redis.smembers(key)


# Global Redis instance
db = RedisDB()


async def get_db():
    """Dependency for getting Redis instance"""
    return db