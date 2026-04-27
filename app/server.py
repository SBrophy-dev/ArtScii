import base64
import os
import tempfile
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from app.ansi import PALETTE, ansi_to_html, strip_ansi
from app.ascii_engine import (
    add_border, art_dimensions, center_art, image_to_ascii, list_fonts,
    text_to_ascii,
)
from app.llm import get_llm

_WEB = Path(__file__).parent.parent / 'web'

app = Flask(__name__, static_folder=str(_WEB), static_url_path='')


# ── Static ────────────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory(_WEB, 'index.html')


# ── Fonts / palette ───────────────────────────────────────────────────────────

@app.route('/api/fonts')
def api_fonts():
    return jsonify({'fonts': list_fonts()})


@app.route('/api/palette')
def api_palette():
    return jsonify({'palette': PALETTE})


# ── Text generation ───────────────────────────────────────────────────────────

@app.route('/api/generate/text', methods=['POST'])
def api_generate_text():
    d      = request.get_json(force=True)
    text   = (d.get('text') or '').strip()
    font   = d.get('font', 'standard')
    border = d.get('border', 'none')
    width  = int(d.get('width', 80))
    center = bool(d.get('centered', False))

    if not text:
        return jsonify({'error': 'text is required'}), 400

    art = text_to_ascii(text, font=font, width=width)
    if border and border != 'none':
        art = add_border(art, style=border)
    if center:
        art = center_art(art, width=width)

    cols, rows = art_dimensions(art)
    return jsonify({'art': art, 'cols': cols, 'rows': rows})


# ── Image generation ──────────────────────────────────────────────────────────

@app.route('/api/generate/image', methods=['POST'])
def api_generate_image():
    d       = request.get_json(force=True)
    img_b64 = d.get('image', '')
    width   = int(d.get('width', 80))
    charset = d.get('char_set', 'standard')
    invert  = bool(d.get('invert', False))

    if not img_b64:
        return jsonify({'error': 'image (base64) is required'}), 400

    try:
        raw = base64.b64decode(img_b64)
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as f:
            f.write(raw)
            tmp = f.name

        art = image_to_ascii(tmp, width=width, char_set=charset, invert=invert)
        os.unlink(tmp)

        cols, rows = art_dimensions(art)
        return jsonify({'art': art, 'cols': cols, 'rows': rows})
    except Exception as exc:
        return jsonify({'error': str(exc)}), 500


# ── Art transforms ────────────────────────────────────────────────────────────

@app.route('/api/art/border', methods=['POST'])
def api_art_border():
    d      = request.get_json(force=True)
    art    = d.get('art', '')
    style  = d.get('style', 'single')

    if not art.strip():
        return jsonify({'error': 'art is required'}), 400

    result = add_border(art, style=style)
    cols, rows = art_dimensions(result)
    return jsonify({'art': result, 'cols': cols, 'rows': rows})


@app.route('/api/art/center', methods=['POST'])
def api_art_center():
    d     = request.get_json(force=True)
    art   = d.get('art', '')
    width = int(d.get('width', 80))
    return jsonify({'art': center_art(art, width=width)})


# ── LLM ───────────────────────────────────────────────────────────────────────

@app.route('/api/llm/status')
def api_llm_status():
    return jsonify(get_llm().status())


@app.route('/api/llm/load', methods=['POST'])
def api_llm_load():
    get_llm().load_async()
    return jsonify({'message': 'loading started'})


@app.route('/api/llm/generate', methods=['POST'])
def api_llm_generate():
    d      = request.get_json(force=True)
    prompt = (d.get('prompt') or '').strip()

    if not prompt:
        return jsonify({'error': 'prompt is required'}), 400

    llm = get_llm()
    if not llm.loaded:
        st = llm.status()
        msg = st.get('message', 'Model not loaded — click Load first')
        return jsonify({'error': msg}), 503

    result = llm.generate(prompt)
    if 'art' in result:
        cols, rows = art_dimensions(result['art'])
        result.update({'cols': cols, 'rows': rows})
    return jsonify(result)


# ── Export (used by TUI; web exports client-side) ─────────────────────────────

@app.route('/api/export', methods=['POST'])
def api_export():
    d      = request.get_json(force=True)
    art    = d.get('art', '')
    fmt    = d.get('format', 'txt')

    if fmt == 'html':
        body = ansi_to_html(art)
        content = (
            '<!DOCTYPE html><html><head><meta charset="UTF-8">'
            '<style>body{background:#111;color:#00ff44;font-family:monospace;'
            'white-space:pre;padding:16px;}</style></head>'
            f'<body>{body}</body></html>'
        )
        return jsonify({'content': content, 'filename': 'art.html', 'mime': 'text/html'})

    if fmt == 'ans':
        return jsonify({'content': art, 'filename': 'art.ans', 'mime': 'application/octet-stream'})

    # default: txt
    return jsonify({'content': strip_ansi(art), 'filename': 'art.txt', 'mime': 'text/plain'})


# ── Runner ────────────────────────────────────────────────────────────────────

def run(host: str = '127.0.0.1', port: int = 5000, debug: bool = False) -> None:
    app.run(host=host, port=port, debug=debug, use_reloader=False)
