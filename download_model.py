import os

from huggingface_hub import snapshot_download


snapshot_download(
    repo_id=os.environ["LAYA_MODEL_REPO"],
    local_dir=os.environ["LAYA_MODEL"],
    ignore_patterns=("multilingual/*", "typed-decisions/*"),
)
