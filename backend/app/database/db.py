from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings

client: AsyncIOMotorClient | None = None
db = None


async def connect():
    global client, db
    client = AsyncIOMotorClient(settings.mongo_url)
    db = client.get_default_database()
    print("[MongoDB] connected")


async def disconnect():
    global client
    if client:
        client.close()
        print("[MongoDB] disconnected")