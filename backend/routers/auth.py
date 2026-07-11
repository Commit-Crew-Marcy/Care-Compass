"""Authentication endpoints.

POST /api/auth/register — create an account, returns a JWT
POST /api/auth/login    — verify credentials, returns a JWT
POST /api/auth/logout   — stateless logout (client discards the token)
GET  /api/auth/me       — the logged-in user's profile
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.security import create_token, get_current_user, hash_password, verify_password
from db.database import get_db
from db.models import User
from models.schemas import AuthResponse, LoginRequest, Message, RegisterRequest, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


def user_out(user: User) -> dict:
    return {"id": user.user_id, "email": user.email, "display_name": user.display_name}


@router.post("/register", response_model=AuthResponse, response_model_by_alias=True, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="An account with that email already exists")

    user = User(email=email, password_hash=hash_password(body.password), display_name=body.display_name)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": create_token(user.user_id), "user": user_out(user)}


@router.post("/login", response_model=AuthResponse, response_model_by_alias=True)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    # Same error for wrong email and wrong password so attackers can't
    # tell which one was incorrect.
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return {"token": create_token(user.user_id), "user": user_out(user)}


@router.post("/logout", response_model=Message, response_model_by_alias=True)
def logout(user: User = Depends(get_current_user)):
    """JWTs are stateless: logging out means the client deletes its token.
    The endpoint exists so the frontend has an explicit logout action and
    so the assignment's register/login/logout requirement is fully met."""
    return {"message": "Logged out. Discard your token on the client."}


@router.get("/me", response_model=UserOut, response_model_by_alias=True)
def me(user: User = Depends(get_current_user)):
    return user_out(user)
