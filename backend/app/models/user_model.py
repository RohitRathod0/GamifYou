import app.database.db as mongo


COLLECTION = "users"


def get_collection():
    return mongo.db[COLLECTION]


async def create_user(user_data: dict):
    collection = get_collection()
    result = await collection.insert_one(user_data)
    return await collection.find_one({"_id": result.inserted_id})


async def get_user_by_username(username: str):
    collection = get_collection()
    return await collection.find_one({"username": username})