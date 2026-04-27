'use strict';

// ── API helpers ───────────────────────────────────────────────────────────────

const api = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json();
  },
};

// ── State ─────────────────────────────────────────────────────────────────────

let allFonts      = [];
let imageBase64   = null;
let selectedColor = null;   // { name, hex, code }

// ── ANSI palette (16 standard colours) ───────────────────────────────────────

const PALETTE = [
  { name: 'black',          hex: '#2e3436' },
  { name: 'red',            hex: '#cc0000' },
  { name: 'green',          hex: '#4e9a06' },
  { name: 'yellow',         hex: '#c4a000' },
  { name: 'blue',           hex: '#3465a4' },
  { name: 'magenta',        hex: '#75507b' },
  { name: 'cyan',           hex: '#06989a' },
  { name: 'white',          hex: '#d3d7cf' },
  { name: 'bright_black',   hex: '#555753' },
  { name: 'bright_red',     hex: '#ef2929' },
  { name: 'bright_green',   hex: '#8ae234' },
  { name: 'bright_yellow',  hex: '#fce94f' },
  { name: 'bright_blue',    hex: '#729fcf' },
  { name: 'bright_magenta', hex: '#ad7fa8' },
  { name: 'bright_cyan',    hex: '#34e2e2' },
  { name: 'bright_white',   hex: '#eeeeec' },
];

// ── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  buildPalette();
  await loadFonts();
  bindEvents();
  pollLlmStatus();
}

// ── Fonts ─────────────────────────────────────────────────────────────────────

async function loadFonts() {
  try {
    const data = await api.get('/api/fonts');
    allFonts = data.fonts || [];
    renderFonts(allFonts);
    document.getElementById('font-count').textContent = `(${allFonts.length})`;
  } catch (e) {
    status(`Failed to load fonts: ${e.message}`);
  }
}

function renderFonts(fonts) {
  const sel = document.getElementById('font-select');
  sel.innerHTML = fonts
    .map(f => `<option value="${f}"${f === 'standard' ? ' selected' : ''}>${f}</option>`)
    .join('');
}

// ── Colour palette ────────────────────────────────────────────────────────────

function buildPalette() {
  const container = document.getElementById('palette');
  container.innerHTML = PALETTE.map(c =>
    `<div class="swatch" style="background:${c.hex}" data-name="${c.name}" data-hex="${c.hex}" title="${c.name}"></div>`
  ).join('');

  container.addEventListener('click', e => {
    const sw = e.target.closest('.swatch');
    if (!sw) return;
    container.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
    selectedColor = { name: sw.dataset.name, hex: sw.dataset.hex };
    document.getElementById('sel-color-box').style.background  = selectedColor.hex;
    document.getElementById('sel-color-name').textContent = selectedColor.name.replace('_', ' ');
  });
}

// ── Event wiring ──────────────────────────────────────────────────────────────

function bindEvents() {
  // Tabs
  document.querySelectorAll('.tab').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );

  // Font search / random / preview
  document.getElementById('font-search').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    renderFonts(q ? allFonts.filter(f => f.includes(q)) : allFonts);
  });
  document.getElementById('btn-random-font').addEventListener('click', () => {
    const f = allFonts[Math.floor(Math.random() * allFonts.length)];
    const sel = document.getElementById('font-select');
    sel.value = f;
    status(`Font: ${f}`);
  });
  document.getElementById('btn-preview-font').addEventListener('click', generateText);

  // Width sliders
  linkSlider('width-range',     'width-val');
  linkSlider('img-width-range', 'img-width-val');

  // Generator
  document.getElementById('btn-generate').addEventListener('click', generateText);
  document.getElementById('gen-text').addEventListener('keydown', e => {
    if (e.key === 'Enter') generateText();
  });

  // LLM
  document.getElementById('btn-llm-gen').addEventListener('click', generateLlm);
  document.getElementById('btn-load-llm').addEventListener('click', loadLlm);
  document.getElementById('llm-prompt').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) generateLlm();
  });

  // Image
  document.getElementById('img-file').addEventListener('change', e => {
    if (e.target.files[0]) loadImageFile(e.target.files[0]);
  });
  const dz = document.getElementById('drop-zone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('over');
    if (e.dataTransfer.files[0]) loadImageFile(e.dataTransfer.files[0]);
  });
  document.getElementById('btn-img-gen').addEventListener('click', generateImage);

  // Editor
  document.getElementById('btn-apply-color').addEventListener('click', applyColor);
  document.getElementById('btn-clear-colors').addEventListener('click', clearColors);
  document.getElementById('btn-add-border').addEventListener('click', addBorderToArt);

  // Toolbar
  document.getElementById('btn-copy').addEventListener('click', copyArt);
  document.getElementById('btn-export-txt').addEventListener('click', () => exportArt('txt'));
  document.getElementById('btn-export-html').addEventListener('click', () => exportArt('html'));
  document.getElementById('btn-export-ans').addEventListener('click', () => exportArt('ans'));

  // Dimension tracking
  const canvas = document.getElementById('canvas');
  canvas.addEventListener('input', updateDims);
}

function linkSlider(rangeId, labelId) {
  const r = document.getElementById(rangeId);
  const l = document.getElementById(labelId);
  r.addEventListener('input', () => { l.textContent = r.value; });
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name)
  );
  document.querySelectorAll('.panel').forEach(p =>
    p.classList.toggle('active', p.id === `tab-${name}`)
  );
}

// ── Text generation ───────────────────────────────────────────────────────────

async function generateText() {
  const text     = document.getElementById('gen-text').value.trim();
  if (!text) { status('Enter some text first'); return; }

  const font     = document.getElementById('font-select').value;
  const border   = document.getElementById('border-select').value;
  const width    = +document.getElementById('width-range').value;
  const centered = document.getElementById('centered-check').checked;

  status('Generating…');
  try {
    const d = await api.post('/api/generate/text', { text, font, border, width, centered });
    if (d.error) { status(`Error: ${d.error}`); return; }
    setCanvas(d.art);
    status(`Font: ${font}  ·  ${d.cols}×${d.rows}`);
  } catch (e) {
    status(`Error: ${e.message}`);
  }
}

// ── LLM generation ────────────────────────────────────────────────────────────

async function generateLlm() {
  const prompt = document.getElementById('llm-prompt').value.trim();
  if (!prompt) { status('Enter a prompt first'); return; }

  const btn = document.getElementById('btn-llm-gen');
  btn.textContent = '⟳ Generating…';
  btn.disabled    = true;
  status('LLM generating…');

  try {
    const d = await api.post('/api/llm/generate', { prompt });
    if (d.error) {
      status(`LLM error: ${d.error}`);
    } else {
      setCanvas(d.art);
      status(`LLM → ${d.type}  ·  ${d.cols}×${d.rows}`);
    }
  } catch (e) {
    status(`Error: ${e.message}`);
  } finally {
    btn.textContent = 'Generate with LLM';
    btn.disabled    = false;
  }
}

async function loadLlm() {
  status('Loading LLM model…');
  await api.post('/api/llm/load', {});
}

async function pollLlmStatus() {
  try {
    const d    = await api.get('/api/llm/status');
    const dot  = document.getElementById('llm-dot');
    const lbl  = document.getElementById('llm-label');
    const msgs = { ready: 'LLM: ready', loading: 'LLM: loading…', not_loaded: 'LLM: not loaded', error: 'LLM: error' };
    dot.className    = `dot ${d.status}`;
    lbl.textContent  = msgs[d.status] || `LLM: ${d.status}`;
    if (d.message) lbl.title = d.message;
  } catch { /* server not yet up */ }
  setTimeout(pollLlmStatus, 3000);
}

// ── Image generation ──────────────────────────────────────────────────────────

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    imageBase64 = e.target.result.split(',')[1];
    document.getElementById('drop-label').textContent = file.name;
    document.getElementById('img-thumb').innerHTML =
      `<img src="${e.target.result}" alt="preview">`;
  };
  reader.readAsDataURL(file);
}

async function generateImage() {
  if (!imageBase64) { status('No image loaded'); return; }

  const width    = +document.getElementById('img-width-range').value;
  const char_set = document.getElementById('charset-select').value;
  const invert   = document.getElementById('invert-check').checked;

  status('Converting image…');
  try {
    const d = await api.post('/api/generate/image', { image: imageBase64, width, char_set, invert });
    if (d.error) { status(`Error: ${d.error}`); return; }
    setCanvas(d.art);
    status(`Image converted  ·  ${d.cols}×${d.rows}`);
  } catch (e) {
    status(`Error: ${e.message}`);
  }
}

// ── Editor ────────────────────────────────────────────────────────────────────

function applyColor() {
  if (!selectedColor) { status('Select a colour from the palette first'); return; }

  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) {
    status('Select text in the preview first');
    return;
  }

  const range = sel.getRangeAt(0);
  const span  = document.createElement('span');
  span.style.color   = selectedColor.hex;
  span.dataset.color = selectedColor.name;

  try {
    range.surroundContents(span);
    updateDims();
    status(`Applied: ${selectedColor.name}`);
  } catch {
    status('Cannot span multiple lines — select within one line');
  }
}

function clearColors() {
  const canvas = document.getElementById('canvas');
  canvas.querySelectorAll('span[data-color]').forEach(sp => {
    sp.replaceWith(document.createTextNode(sp.textContent));
  });
  status('Colours cleared');
}

async function addBorderToArt() {
  const style = document.getElementById('edit-border-select').value;
  if (style === 'none') return;

  const art = document.getElementById('canvas').innerText;
  if (!art.trim()) { status('Nothing to border'); return; }

  try {
    const d = await api.post('/api/art/border', { art, style });
    if (d.error) { status(`Error: ${d.error}`); return; }
    setCanvas(d.art);
    status(`Border added: ${style}`);
  } catch (e) {
    status(`Error: ${e.message}`);
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

async function copyArt() {
  const text = document.getElementById('canvas').innerText;
  try {
    await navigator.clipboard.writeText(text);
    status('Copied to clipboard');
  } catch {
    status('Clipboard blocked — select text and Ctrl+C manually');
  }
}

function exportArt(fmt) {
  const canvas = document.getElementById('canvas');

  if (fmt === 'html') {
    // Client-side: capture the rendered HTML including coloured spans
    const inner = canvas.innerHTML;
    const blob  = new Blob([
      `<!DOCTYPE html><html><head><meta charset="UTF-8">`,
      `<style>body{background:#111;color:#00ff44;font-family:monospace;`,
      `white-space:pre;padding:16px;line-height:1.2;}</style></head>`,
      `<body>${inner}</body></html>`,
    ], { type: 'text/html' });
    triggerDownload(blob, 'art.html');
    status('Exported: art.html');
    return;
  }

  const text = canvas.innerText;
  if (fmt === 'ans') {
    triggerDownload(new Blob([text], { type: 'application/octet-stream' }), 'art.ans');
    status('Exported: art.ans');
  } else {
    triggerDownload(new Blob([text], { type: 'text/plain' }), 'art.txt');
    status('Exported: art.txt');
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function setCanvas(art) {
  const canvas = document.getElementById('canvas');
  canvas.textContent = art;
  updateDims();
}

function updateDims() {
  const lines  = document.getElementById('canvas').innerText.split('\n');
  const cols   = Math.max(...lines.map(l => l.length), 0);
  const rows   = lines.length;
  document.getElementById('art-dims').textContent = `${cols} × ${rows} chars`;
}

function status(msg) {
  document.getElementById('status-msg').textContent = msg;
}

// ── Start ─────────────────────────────────────────────────────────────────────
boot();
