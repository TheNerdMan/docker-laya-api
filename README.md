# Laya API

Minimal HTTP API and optional browser demo for `convaiinnovations/laya`.

## Container images

The GitHub Actions workflow publishes three Linux/amd64 images to GitHub Container Registry:

| Image | Model behavior |
| --- | --- |
| `ghcr.io/thenerdman/docker-laya-api-portable:latest` | Downloads the latest `convaiinnovations/laya` weights from Hugging Face each time a new container starts. |
| `ghcr.io/thenerdman/docker-laya-api-bundled:latest` | Includes the weights and runs without downloading them. |
| `ghcr.io/thenerdman/docker-laya-api-hosted:latest` | Requires an existing model directory mounted from the host and disables Hugging Face and Transformers network access. |

Run the portable image with a named volume to reuse its download between containers:

```powershell
docker run --rm -p 8000:8000 -v laya-model:/models/laya ghcr.io/thenerdman/docker-laya-api-portable:latest
```

Run the bundled image directly:

```powershell
docker run --rm -p 8000:8000 ghcr.io/thenerdman/docker-laya-api-bundled:latest
```

Run the hosted image with an absolute host path containing `rl_agent_config.json`, `model.safetensors`, and the model's tokenizer and encoder directories:

```powershell
$modelPath = (Resolve-Path "C:\models\laya").Path
docker run --rm -p 8000:8000 -v "${modelPath}:/model:ro" ghcr.io/thenerdman/docker-laya-api-hosted:latest
```

The hosted container exits before starting the HTTP server if `/model` is absent. To mount elsewhere, set `LAYA_MODEL` to that absolute container path. Inference defaults to CPU; set `LAYA_DEVICE=cuda` (and run Docker with `--gpus all`) to use an available NVIDIA GPU. All variants accept `LAYA_WARMUP`, `LAYA_DEMO`, `LAYA_PORT`, `LAYA_MAX_BODY_BYTES`, and `LAYA_DEVICE`; `HF_TOKEN` is supported for private Hugging Face access.

Build the images locally from the same Dockerfile:

```powershell
docker build --target portable -t laya-api-portable .
docker build --target bundled -t laya-api-bundled .
docker build --target hosted -t laya-api-hosted .
```

Pushes to `main`, version tags such as `v1.0.0`, and manual workflow runs publish all three image names. The default branch additionally receives `latest`; every build receives a commit SHA tag.

## Quickest setup

```powershell
venv\Scripts\python.exe -m pip install -r requirements.txt; $env:LAYA_WARMUP="true"; $env:LAYA_DEMO="true"; venv\Scripts\python.exe app.py
```

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
- GPT-5.6 Sol
