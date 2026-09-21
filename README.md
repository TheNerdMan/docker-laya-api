# Laya API

Minimal HTTP API and optional browser demo for `convaiinnovations/laya`.

## Quick setup

```powershell
venv\Scripts\python.exe -m pip install -r requirements.txt
$env:LAYA_WARMUP="true"
$env:LAYA_DEMO="true"
venv\Scripts\python.exe app.py
```

The API listens on `http://localhost:8000` and logs the URL at startup. The model is warmed on launch by default; set `LAYA_WARMUP=false` to disable it. Set `LAYA_DEMO=false` to disable the browser demo at `/`.

## Endpoints

- `GET /health` — HTTP server health.
- `GET /ready` — model readiness; returns `503` while loading.
- `POST /predict` — evaluate a state against `choice`, `score`, or `noul` questions.

Example request:

```json
{
  "state": "A customer was charged twice and wants a refund.",
  "questions": {
    "intent": {
      "type": "choice",
      "instructions": "Which team should handle this?",
      "criteria": {
        "billing": "payments and refunds",
        "technical": "bugs and outages"
      }
    }
  }
}
```

## AI disclosure

Built with:

- [Oh My Pi Harness](https://omp.sh/)
- GPT-5.6 Luna
