# level-up-journey

## Backend Start

```bash
docker-compose up --build -d
```

## Swagger

`http://localhost:8000/docs`

## Initialize Path

```bash
curl -X POST http://localhost:8000/paths/initialize \
  -H "Content-Type: application/json" \
  -d '{
    "route_name": "AI Inference",
    "current_status": "I am learning vLLM and have used it in HPC experiments.",
    "past_achievements": "Joined PiComp-Lab as a US master'\''s student for related research.",
    "lang": "en"
  }'
```

## Process Action Log

```bash
curl -X POST http://localhost:8000/action-logs/process \
  -H "Content-Type: application/json" \
  -d '{
    "action_log": "Today I deployed a vLLM inference service on HPC and improved async flow plus structured logging in a FastAPI endpoint.",
    "lang": "en"
  }'
```
