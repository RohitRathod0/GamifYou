from app.models.user_model import create_user, get_user_by_username
from app.core.security import hash_password, verify_password
async def register_user(username: str, password: str):
    existing = await get_user_by_username(username)

    if existing:
        return None

    user_data = {
        "username": username,
        "password": hash_password(password),
    }

    return await create_user(user_data)


async def authenticate_user(username: str, password: str):
    user = await get_user_by_username(username)

    if not user:
        return None

    if not verify_password(password, user["password"]):
        return None

    return user