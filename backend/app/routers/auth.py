from fastapi import APIRouter, HTTPException

from app.schemas.user import UserCreate, UserLogin, Token
from app.services.auth_service import register_user, authenticate_user
from app.core.security import create_access_token

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=Token)
async def register(user: UserCreate):
    db_user = await register_user(user.username, user.password)

    if not db_user:
        raise HTTPException(status_code=400, detail="User already exists")

    token = create_access_token({"sub": db_user["username"]})

    return {
        "access_token": token,
        "token_type": "bearer"
    }


@router.post("/login", response_model=Token)
async def login(user: UserLogin):
    db_user = await authenticate_user(user.username, user.password)

    if not db_user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({"sub": db_user["username"]})

    return {
        "access_token": token,
        "token_type": "bearer"
    }