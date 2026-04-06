# Backend

FastAPI backend scaffold.

## Structure

- `app/`: API entrypoint and route modules
- `src/`: algorithm implementations
- `tests/`: backend tests

## Run locally

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

