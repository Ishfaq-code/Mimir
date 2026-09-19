# Mimir

Mimir includes a Next.js frontend and a FastAPI backend.

## Run With Docker

Put your MyScript Cloud credentials in `backend/.env` before starting the
services. The file is created with empty values; `backend/.env.example` shows
the available settings.

Start both services from the repository root:

```bash
docker compose up --build
```

The Compose backend runs Uvicorn with `--reload` and mounts `./backend`, so
Python changes are picked up without rebuilding the image. Use `docker compose
restart backend` only when changing backend dependencies.

The services are available at:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API documentation: http://localhost:8000/docs
- Backend health check: http://localhost:8000/health

Stop the services with:

```bash
docker compose down
```
