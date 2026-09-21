from __future__ import annotations

import json
import os
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

HOST = os.getenv("LAYA_HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", os.getenv("LAYA_PORT", "8000")))
MODEL_ID = os.getenv("LAYA_MODEL", "convaiinnovations/laya")
WARMUP = os.getenv("LAYA_WARMUP", "true").lower() in {"1", "true", "yes", "on"}
DEMO = os.getenv("LAYA_DEMO", "false").lower() in {"1", "true", "yes", "on"}
MAX_BODY_BYTES = int(os.getenv("LAYA_MAX_BODY_BYTES", "1048576"))
STATIC_DIR = Path(__file__).parent / "static"

_model: Any = None
_load_error: str | None = None
_model_lock = threading.Lock()
_predict_lock = threading.Lock()
_ready = threading.Event()

WARMUP_STATE = {"text": "A customer reports a duplicate charge and requests a refund."}
WARMUP_QUESTIONS = {
    "intent": {
        "type": "choice",
        "instructions": "What is the main reason for this message?",
        "criteria": {"billing": "payments, invoices, or refunds", "other": "anything else"},
    },
}


def _load_model() -> Any:
    global _model, _load_error
    if _model is not None:
        return _model
    with _model_lock:
        if _model is None:
            try:
                import laya

                _model = laya.load(MODEL_ID)
                _load_error = None
            except Exception as exc:  # keep health available when model startup fails
                _load_error = f"{type(exc).__name__}: {exc}"
                raise
            else:
                _ready.set()
    return _model


def _warm_model() -> None:
    try:
        model = _load_model()
        with _predict_lock:
            model.predict(WARMUP_STATE, WARMUP_QUESTIONS)
        print("Laya model warmed and ready", flush=True)
    except Exception as exc:
        print(f"Laya model warmup failed: {exc}", flush=True)


def _validate_request(payload: Any) -> tuple[Any, dict[str, dict[str, Any]]]:
    if not isinstance(payload, dict):
        raise ValueError("request body must be a JSON object")
    state = payload.get("state")
    if not isinstance(state, (str, dict, list)) or not state:
        raise ValueError("state must be a non-empty string, object, or list")
    questions = payload.get("questions")
    if not isinstance(questions, dict) or not questions or len(questions) > 32:
        raise ValueError("questions must be an object with 1 to 32 entries")

    for question_id, question in questions.items():
        if not isinstance(question_id, str) or not question_id or len(question_id) > 64:
            raise ValueError("question ids must be non-empty strings no longer than 64 characters")
        if not isinstance(question, dict):
            raise ValueError(f"question {question_id!r} must be an object")
        kind = question.get("type")
        if kind not in {"choice", "score", "noul"}:
            raise ValueError(f"question {question_id!r} has an unsupported type")
        instructions = question.get("instructions")
        if not isinstance(instructions, str) or not instructions.strip() or len(instructions) > 2000:
            raise ValueError(f"question {question_id!r} needs instructions (1-2000 characters)")
        criteria = question.get("criteria")
        if kind == "choice":
            if isinstance(criteria, dict):
                valid = criteria and all(isinstance(k, str) and k for k in criteria)
            elif isinstance(criteria, list):
                valid = bool(criteria) and all(isinstance(item, str) and item for item in criteria)
            else:
                valid = False
            if not valid:
                raise ValueError(f"choice question {question_id!r} needs a non-empty criteria object or list")
        elif kind == "score":
            if not isinstance(criteria, list) or not criteria or len(criteria) > 32:
                raise ValueError(f"score question {question_id!r} needs 1-32 criteria levels")
            if not all(isinstance(item, (str, int, float, bool, dict, list)) for item in criteria):
                raise ValueError(f"score question {question_id!r} has invalid criteria")
        elif criteria is not None and not isinstance(criteria, dict):
            raise ValueError(f"noul question {question_id!r} criteria must be an object")
    return state, questions


def _json_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}", flush=True)

    def _send(self, status: int, payload: Any, content_type: str = "application/json") -> None:
        body = _json_bytes(payload) if content_type == "application/json" else payload
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _error(self, status: int, message: str) -> None:
        self._send(status, {"error": message})

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send(HTTPStatus.OK, {"status": "ok"})
            return
        if self.path == "/ready":
            if _ready.is_set():
                self._send(HTTPStatus.OK, {"status": "ready", "model": MODEL_ID})
            else:
                payload = {"status": "loading" if _load_error is None else "error"}
                if _load_error is not None:
                    payload["detail"] = _load_error
                self._send(HTTPStatus.SERVICE_UNAVAILABLE, payload)
            return
        if self.path == "/" and DEMO:
            self._serve_static("index.html")
            return
        if self.path.startswith("/static/") and DEMO:
            self._serve_static(self.path.removeprefix("/static/"))
            return
        self._error(HTTPStatus.NOT_FOUND, "not found")

    def _serve_static(self, name: str) -> None:
        allowed = {"index.html": "text/html", "app.js": "text/javascript", "styles.css": "text/css"}
        if name not in allowed:
            self._error(HTTPStatus.NOT_FOUND, "not found")
            return
        body = (STATIC_DIR / name).read_bytes()
        self._send(HTTPStatus.OK, body, allowed[name])

    def do_POST(self) -> None:
        if self.path != "/predict":
            self._error(HTTPStatus.NOT_FOUND, "not found")
            return
        length_header = self.headers.get("Content-Length")
        try:
            length = int(length_header or "0")
        except ValueError:
            self._error(HTTPStatus.BAD_REQUEST, "Content-Length must be an integer")
            return
        if length <= 0 or length > MAX_BODY_BYTES:
            self._error(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "request body is empty or too large")
            return
        try:
            payload = json.loads(self.rfile.read(length))
            state, questions = _validate_request(payload)
            model = _load_model()
            with _predict_lock:
                result = model.predict(state, questions)
            self._send(HTTPStatus.OK, result)
        except ValueError as exc:
            self._error(HTTPStatus.BAD_REQUEST, str(exc))
        except Exception as exc:
            print(f"Prediction failed: {type(exc).__name__}: {exc}", flush=True)
            self._error(HTTPStatus.SERVICE_UNAVAILABLE, "model is unavailable")


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Laya API listening on http://localhost:{PORT}", flush=True)
    if WARMUP:
        threading.Thread(target=_warm_model, name="laya-warmup", daemon=True).start()
    else:
        print("Laya warmup disabled (LAYA_WARMUP=false)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nLaya API stopping", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
