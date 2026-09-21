# syntax=docker/dockerfile:1

FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    USE_TF=0 \
    HF_HOME=/models/cache

WORKDIR /app

RUN groupadd --system laya \
    && useradd --system --gid laya --home-dir /app laya \
    && mkdir -p /models \
    && chown laya:laya /app /models

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=laya:laya app.py download_model.py ./
COPY --chown=laya:laya static ./static

USER laya
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; port=os.getenv('PORT', os.getenv('LAYA_PORT', '8000')); urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=2)"]

FROM runtime AS portable
ENV LAYA_MODEL_REPO=convaiinnovations/laya \
    LAYA_MODEL=/models/laya
CMD ["sh", "-c", "python download_model.py && exec python app.py"]

FROM runtime AS bundled-download
ARG LAYA_MODEL_REPO=convaiinnovations/laya
ENV LAYA_MODEL_REPO=${LAYA_MODEL_REPO} \
    LAYA_MODEL=/models/laya
RUN python download_model.py

FROM runtime AS bundled
ENV LAYA_MODEL=/models/laya \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1
COPY --from=bundled-download --chown=laya:laya /models/laya /models/laya
CMD ["python", "app.py"]

FROM runtime AS hosted
ENV LAYA_MODEL=/model \
    LAYA_REQUIRE_LOCAL_MODEL=true \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1
CMD ["python", "app.py"]
