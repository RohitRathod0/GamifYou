import asyncio
from app.database import db
from app.redis_db import db as redis_db

async def main():
    print('Testing redis')
    await redis_db.connect()
    print('Testing mongo')
    await db.connect()
    print('Done')

asyncio.run(main())
