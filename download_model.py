"""
Download the Bonsai 1.7B GGUF model for ArtScii.

Model:  prism-ml/Ternary-Bonsai-1.7B-gguf
Type:   1.58-bit ternary ({-1, 0, +1} weights) — same concept as BitNet
Size:   ~400-700 MB depending on quantisation
Usage:  CPU-only inference via llama-cpp-python
Auth:   None required — publicly accessible

Run once before launching ArtScii with LLM features:
    python download_model.py
"""

import sys
from pathlib import Path

MODEL_DIR  = Path('models')
MODEL_FILE = MODEL_DIR / 'model.gguf'

REPO_ID = 'prism-ml/Ternary-Bonsai-1.7B-gguf'

# Preference order for quantisation variants (smallest viable first)
_PREF_KEYWORDS = ['Q4_K_M', 'Q4_K', 'q4_k_m', 'q4_k', 'Q4', 'q4']


def _pick_gguf(repo_files: list[str]) -> str | None:
    """Return the best GGUF filename from the repo listing."""
    ggufs = [f for f in repo_files if f.endswith('.gguf')]
    if not ggufs:
        return None
    # Prefer Q4_K_M (best quality/size balance), fall through to any GGUF
    for kw in _PREF_KEYWORDS:
        for name in ggufs:
            if kw in name:
                return name
    return ggufs[0]


def download(hf_token: str | None = None) -> None:
    try:
        from huggingface_hub import hf_hub_download, list_repo_files
    except ImportError:
        print('ERROR: huggingface-hub not installed.')
        print('       Run:  pip install huggingface-hub')
        sys.exit(1)

    MODEL_DIR.mkdir(exist_ok=True)

    if MODEL_FILE.exists():
        size_mb = MODEL_FILE.stat().st_size / 1_048_576
        print(f'Model already present ({size_mb:.0f} MB): {MODEL_FILE}')
        return

    print(f'Fetching file list from {REPO_ID} …')
    try:
        repo_files = list(list_repo_files(REPO_ID, token=hf_token))
    except Exception as exc:
        print(f'ERROR listing repo: {exc}')
        _print_manual_help()
        sys.exit(1)

    target = _pick_gguf(repo_files)
    if not target:
        print('ERROR: No GGUF file found in repo.')
        print('Files found:', repo_files)
        sys.exit(1)

    print(f'Downloading: {target}')
    print('Ternary (1.58-bit) model — download once, runs locally forever.\n')

    try:
        downloaded = hf_hub_download(
            repo_id=REPO_ID,
            filename=target,
            local_dir=MODEL_DIR,
            local_dir_use_symlinks=False,
            token=hf_token,
        )
        src = Path(downloaded)
        if src.resolve() != MODEL_FILE.resolve():
            src.rename(MODEL_FILE)
        size_mb = MODEL_FILE.stat().st_size / 1_048_576
        print(f'\nSaved ({size_mb:.0f} MB): {MODEL_FILE}')
        print('Run the app:  python run.py --web')
    except Exception as exc:
        print(f'Download failed: {exc}')
        _print_manual_help()
        sys.exit(1)


def _print_manual_help() -> None:
    print(f'\nManual download: https://huggingface.co/{REPO_ID}')
    print(f'Place any .gguf file from that page at:  {MODEL_FILE}')


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--token', default=None,
                    help='HuggingFace token (only needed for gated repos)')
    args = ap.parse_args()
    download(hf_token=args.token)
