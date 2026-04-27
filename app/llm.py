"""
LLM integration via llama-cpp-python.

Model: prism-ml/Ternary-Bonsai-1.7B-gguf
  - 1.58-bit ternary weights ({-1, 0, +1}) — same concept as BitNet
  - ~400-700 MB on disk (varies by quantisation), CPU-only inference
  - Loaded once at startup; shared across web and TUI

Architecture: hybrid pipeline
  1. LLM parses natural-language intent → structured JSON
  2. JSON routes to deterministic ASCII engine for precise rendering
  3. Freeform art requests (scenes, drawings) go to direct LLM generation
"""

import json
import re
import threading
from pathlib import Path

try:
    from llama_cpp import Llama
    LLAMA_AVAILABLE = True
except ImportError:
    LLAMA_AVAILABLE = False

from app.ascii_engine import text_to_ascii, add_border

MODEL_PATH = Path('models') / 'model.gguf'

# Tight system prompt — small models need explicit, bounded instructions
_SYSTEM = """\
You are an ASCII art generator. Given a user request, respond with EXACTLY ONE of:

A) A JSON object (for text/banner requests):
{"type":"banner","text":"EXACT TEXT","font":"big|standard|banner|block|slant|mini","border":"none|single|double|rounded"}

B) Raw ASCII art only (for drawings, shapes, scenes) — no markdown, no explanation, just the art.

Rules: under 20 rows, under 78 columns, printable ASCII only.\
"""

# Font hint → actual pyfiglet font name
FONT_MAP = {
    'big':      'big',
    'block':    'block',
    'banner':   'banner',
    'slant':    'slant',
    'mini':     'mini',
    'standard': 'standard',
    'shadow':   'shadow',
    'thin':     'thin',
}


class AsciiLLM:
    def __init__(self) -> None:
        self.model    = None
        self.loaded   = False
        self.loading  = False
        self.error    = None
        self._thread  = None

    # ── Loading ───────────────────────────────────────────────────────────────

    def load_async(self) -> None:
        if self.loading or self.loaded:
            return
        self.loading = True
        self._thread = threading.Thread(target=self._load, daemon=True)
        self._thread.start()

    def _load(self) -> None:
        if not LLAMA_AVAILABLE:
            self.error   = 'llama-cpp-python not installed — run: python setup_llm.py'
            self.loading = False
            return

        if not MODEL_PATH.exists():
            self.error   = f'Model not found at {MODEL_PATH} — run: python download_model.py'
            self.loading = False
            return

        try:
            self.model  = Llama(
                model_path=str(MODEL_PATH),
                n_ctx=2048,
                n_threads=4,
                verbose=False,
            )
            self.loaded = True
            self.error  = None
        except Exception as exc:
            self.error  = str(exc)
        finally:
            self.loading = False

    # ── Status ────────────────────────────────────────────────────────────────

    def status(self) -> dict:
        if self.loaded:
            return {'status': 'ready'}
        if self.loading:
            return {'status': 'loading'}
        if self.error:
            return {'status': 'error', 'message': self.error}
        return {'status': 'not_loaded'}

    # ── Generation ────────────────────────────────────────────────────────────

    def generate(self, user_input: str) -> dict:
        if not self.loaded:
            st = self.status()
            return {'error': st.get('message', 'Model not loaded'), 'fallback': True}

        prompt = f'System: {_SYSTEM}\n\nUser: {user_input}\nAssistant:'
        try:
            resp = self.model(
                prompt,
                max_tokens=400,
                temperature=0.2,
                top_p=0.9,
                stop=['User:', '\nUser'],
            )
            raw = resp['choices'][0]['text'].strip()
            return self._parse(raw, user_input)
        except Exception as exc:
            return {'error': str(exc), 'fallback': True}

    def _parse(self, raw: str, original: str) -> dict:
        # Strip markdown fences if present
        raw = re.sub(r'^```[^\n]*\n?', '', raw).rstrip('`').strip()

        # Try JSON intent
        m = re.search(r'\{[^{}]+\}', raw, re.DOTALL)
        if m:
            try:
                intent = json.loads(m.group())
                if intent.get('type') == 'banner':
                    return self._render_banner(intent)
            except json.JSONDecodeError:
                pass

        # Raw ASCII art — if it spans multiple lines it's likely art
        if raw.count('\n') >= 2:
            return {'type': 'raw', 'art': raw}

        # Fallback: treat quoted text (or full input) as banner
        quoted = re.search(r'["\']([^"\']+)["\']', original)
        text   = quoted.group(1) if quoted else original
        art    = text_to_ascii(text, font='standard')
        return {'type': 'banner_fallback', 'art': art}

    def _render_banner(self, intent: dict) -> dict:
        text   = intent.get('text', '')
        font   = FONT_MAP.get(intent.get('font', 'standard'), 'standard')
        border = intent.get('border', 'none')

        art = text_to_ascii(text, font=font)
        if border and border != 'none':
            art = add_border(art, style=border)

        return {'type': 'banner', 'art': art, 'text': text, 'font': font}


# Module-level singleton so model is loaded once per process
_instance: AsciiLLM | None = None


def get_llm() -> AsciiLLM:
    global _instance
    if _instance is None:
        _instance = AsciiLLM()
    return _instance
