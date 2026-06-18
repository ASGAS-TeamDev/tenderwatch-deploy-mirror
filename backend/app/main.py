"""FastAPI entry point. Real implementation in Task 10."""
from fastapi import FastAPI

app = FastAPI(title="Tender Watch", version="0.1.0")


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "tender-watch", "status": "placeholder"}
