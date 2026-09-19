# Mimir

Mimir includes a Next.js frontend and a FastAPI backend.

## Run With Docker

Start both services from the repository root:

```bash
docker compose up --build
```

The services are available at:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API documentation: http://localhost:8000/docs
- Backend health check: http://localhost:8000/health

Stop the services with:

```bash
docker compose down
```
