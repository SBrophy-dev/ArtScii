'use strict';

// ── API ───────────────────────────────────────────────────────────────────────

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
let selectedColor = null;
let savedRange    = null;   // last cursor position inside canvas
let fontSize      = 13;
let findOffset    = 0;      // for find-next tracking

// ── ANSI palette ──────────────────────────────────────────────────────────────

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

// ── Templates ─────────────────────────────────────────────────────────────────

const W = 40; // default separator width

const TEMPLATES = {
  separators: [
    { label: 'Thin ─',     art: '─'.repeat(W) },
    { label: 'Double ═',   art: '═'.repeat(W) },
    { label: 'Heavy ━',    art: '━'.repeat(W) },
    { label: 'Dots ·',     art: Array(W / 2 + 1).join('· ').trim() },
    { label: 'Dash -',     art: Array(W / 2 + 1).join('- ').trim() },
    { label: 'Wave ~',     art: '~'.repeat(W) },
    { label: 'Hash #',     art: Array(W / 2 + 1).join('# ').trim() },
    { label: '→ Arrow',    art: '─'.repeat(W - 1) + '▶' },
    { label: '← Arrow',   art: '◀' + '─'.repeat(W - 1) },
    { label: '↔ Both',     art: '◀' + '─'.repeat(W - 2) + '▶' },
    { label: '◆ Diamond',  art: '·' + '─'.repeat(16) + '·◆·' + '─'.repeat(16) + '·' },
    { label: '★ Star',     art: '── ★ ' + '─'.repeat(W - 5) },
  ],

  boxes: [
    { label: 'Single',   art: '┌──────────────┐\n│              │\n└──────────────┘' },
    { label: 'Double',   art: '╔══════════════╗\n║              ║\n╚══════════════╝' },
    { label: 'Rounded',  art: '╭──────────────╮\n│              │\n╰──────────────╯' },
    { label: 'Heavy',    art: '┏━━━━━━━━━━━━━━┓\n┃              ┃\n┗━━━━━━━━━━━━━━┛' },
    { label: 'ASCII',    art: '+──────────────+\n|              |\n+──────────────+' },
    { label: 'Title ═',  art: '╔═══[ TITLE ]═══╗\n║               ║\n╚═══════════════╝' },
    { label: 'Panel ─',  art: '┌─ Panel ────────┐\n│                │\n│                │\n└────────────────┘' },
    { label: 'Shadow',   art: '┌──────────────┐\n│              │\n└──────────────┘\n  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓' },
    { label: '3-col',    art: '┌──────┬──────┬──────┐\n│      │      │      │\n└──────┴──────┴──────┘' },
    { label: 'Nested',   art: '╔══════════════╗\n║ ┌──────────┐ ║\n║ │          │ ║\n║ └──────────┘ ║\n╚══════════════╝' },
  ],

  headers: [
    { label: '>>== Arrow',  art: '>>==[ HEADER ]==<<' },
    { label: '##  Hash',    art: '##  HEADER  ##' },
    { label: '*** Star',    art: '*** HEADER ***' },
    { label: '|== Pipe',    art: '|== HEADER ==|' },
    { label: '>>> Chevron', art: '>>> HEADER <<<' },
    { label: '█▓▒ Block',   art: '█▓▒░ HEADER ░▒▓█' },
    { label: '··· Dots',    art: '··· HEADER ···' },
    { label: '═══ Double',  art: '═══ HEADER ═══' },
    { label: '[ Bracket ]', art: '[ HEADER ]' },
    { label: '// Slash',    art: '//  HEADER  //' },
    { label: '-- Minus',    art: '--- HEADER ---' },
    { label: '~~~ Wave',    art: '~~~ HEADER ~~~' },
    { label: ': Colon :',   art: '::: HEADER :::' },
    { label: '» Guillemet', art: '»»» HEADER «««' },
  ],

  shapes: [
    { label: 'Triangle',  art: '    /\\\n   /  \\\n  /    \\\n /______\\' },
    { label: 'Diamond',   art: '    ◆\n   ◆ ◆\n  ◆   ◆\n   ◆ ◆\n    ◆' },
    { label: 'Arrow →',   art: '──────────────▶' },
    { label: 'Arrow ←',   art: '◀──────────────' },
    { label: 'Arrow ↕',   art: '     ▲\n     │\n     │\n     │\n     ▼' },
    { label: 'Arrow ↗',   art: '       ▲\n      /\n     /\n    /' },
    { label: 'Stairs →',  art: '█\n██\n███\n████\n█████' },
    { label: 'Pyramid',   art: '    ▲\n   ███\n  █████\n ███████\n█████████' },
    { label: 'Corner ┌',  art: '┌──\n│' },
    { label: 'Corner ┐',  art: '──┐\n  │' },
    { label: 'Corner └',  art: '│\n└──' },
    { label: 'Corner ┘',  art: '  │\n──┘' },
  ],

  notes: [
    { label: 'NOTE',       art: '┌─ NOTE ───────────────────┐\n│                          │\n└──────────────────────────┘' },
    { label: 'WARNING',    art: '┌─ ⚠ WARNING ──────────────┐\n│                          │\n└──────────────────────────┘' },
    { label: 'ERROR',      art: '┌─ ✗ ERROR ────────────────┐\n│                          │\n└──────────────────────────┘' },
    { label: 'TODO',       art: '[ TODO: ________________________ ]' },
    { label: 'FIXME',      art: '[ FIXME: _______________________ ]' },
    { label: '[ Tag ]',    art: '[ TAG ]' },
    { label: '( Tag )',    art: '( TAG )' },
    { label: 'v badge',    art: '[ v1.0 ]' },
    { label: 'Speech →',   art: '┌──────────────────┐\n│                  │\n└──┬───────────────┘\n   │\n   ▼' },
    { label: 'Speech ←',   art: '┌───────────────┬──┐\n│               │  │\n└───────────────┴──┘\n               │\n               ▼' },
    { label: 'Think',      art: '  _____________\n(  thinking…   )\n ─────────────\n   o\n    o  ·\n       ·' },
    { label: '/!\\ Warn',   art: '    /!\\\n   / ! \\\n  /─────\\' },
    { label: 'Banner box', art: '┌─────────────────────────┐\n│  Project Name           │\n│  v1.0  ·  Author        │\n└─────────────────────────┘' },
  ],
};

// ── Symbols / Icons ───────────────────────────────────────────────────────────

const ICONS = {
  'Box Drawing': [
    '┌','┬','┐','├','┼','┤','└','┴','┘','│','─',
    '╭','╮','╰','╯',
    '╔','╦','╗','╠','╬','╣','╚','╩','╝','║','═',
    '┏','┳','┓','┣','╋','┫','┗','┻','┛','┃','━',
    '╞','╡','╟','╢','╤','╧','╪','╫',
    '┄','┅','┆','┇','┈','┉','┊','┋',
  ],
  'Block Elements': [
    '█','▓','▒','░',
    '▄','▀','▌','▐',
    '▖','▗','▘','▝','▙','▚','▛','▜','▟',
    '▁','▂','▃','▄','▅','▆','▇',
    '▏','▎','▍','▌','▋','▊','▉',
  ],
  'Geometric': [
    '■','□','▪','▫','▬','▭',
    '●','○','◆','◇','◈','◉','◊',
    '▲','△','▼','▽','◀','▶','◁','▷',
    '⬡','⬢','⬣','⬤',
  ],
  'Arrows': [
    '←','→','↑','↓','↔','↕',
    '↖','↗','↘','↙','↩','↪','↺','↻',
    '⇐','⇒','⇑','⇓','⇔','⇕',
    '⇖','⇗','⇘','⇙',
    '➔','➜','➝','➞','➟','➠',
    '▶','◀','▲','▼',
  ],
  'Stars & Marks': [
    '★','☆','✦','✧','✸','✹','✺','✻','✼','✽',
    '❋','✿','❀','❁','❂','❃',
    '✓','✗','✘','✔','✖',
    '♦','♠','♣','♥','♪','♫','♬','♩',
  ],
  'Tech & Misc': [
    '⚙','⚡','⚠','⚬','⊙','⊚','⊛',
    '◉','≡','≣','⁞','⋮','⋯',
    '·','•','‣','‥','…',
    '§','¶','†','‡','©','®','™',
    '∞','≈','±','×','÷','√',
    '«','»','‹','›',
  ],
};

// ── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  buildPalette();
  buildTemplates();
  buildIconCategorySelect();
  buildIconGrid();
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

// ── Palette ───────────────────────────────────────────────────────────────────

function buildPalette() {
  const el = document.getElementById('palette');
  el.innerHTML = PALETTE.map(c =>
    `<div class="swatch" style="background:${c.hex}"
          data-name="${c.name}" data-hex="${c.hex}" title="${c.name}"></div>`
  ).join('');

  el.addEventListener('click', e => {
    const sw = e.target.closest('.swatch');
    if (!sw) return;
    el.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
    sw.classList.add('selected');
    selectedColor = { name: sw.dataset.name, hex: sw.dataset.hex };
    document.getElementById('sel-color-box').style.background = selectedColor.hex;
    document.getElementById('sel-color-name').textContent = selectedColor.name.replace(/_/g, ' ');
  });
}

// ── Templates ─────────────────────────────────────────────────────────────────

function buildTemplates() {
  const map = {
    separators: 'tpl-separators',
    boxes:      'tpl-boxes',
    headers:    'tpl-headers',
    shapes:     'tpl-shapes',
    notes:      'tpl-notes',
  };

  for (const [key, elId] of Object.entries(map)) {
    const grid = document.getElementById(elId);
    if (!grid) continue;

    grid.innerHTML = TEMPLATES[key].map((t, i) =>
      `<button class="tpl-btn" data-tpl-key="${key}" data-tpl-idx="${i}"
               title="${escHtml(t.art)}">${escHtml(t.label)}</button>`
    ).join('');

    grid.addEventListener('click', e => {
      const btn = e.target.closest('.tpl-btn');
      if (!btn) return;
      const art = TEMPLATES[btn.dataset.tplKey][+btn.dataset.tplIdx].art;
      insertTemplate(art);
    });
  }
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function buildIconCategorySelect() {
  const sel = document.getElementById('icon-cat-select');
  sel.innerHTML = Object.keys(ICONS)
    .map(cat => `<option value="${cat}">${cat}</option>`)
    .join('');
  sel.addEventListener('change', () => buildIconGrid());
}

function buildIconGrid(filter = '') {
  const cat   = document.getElementById('icon-cat-select').value;
  const chars = (ICONS[cat] || []).filter(c =>
    !filter || c.includes(filter)
  );

  const grid = document.getElementById('icon-grid');
  grid.innerHTML = chars.map(c =>
    `<div class="icon-char" data-char="${escHtml(c)}" title="${escHtml(c)}">${c}</div>`
  ).join('');

  grid.addEventListener('click', e => {
    const ic = e.target.closest('.icon-char');
    if (ic) insertChar(ic.dataset.char);
  });
}

// ── Events ────────────────────────────────────────────────────────────────────

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
    const f   = allFonts[Math.floor(Math.random() * allFonts.length)];
    const sel = document.getElementById('font-select');
    sel.value = f;
    status(`Font: ${f}`);
  });
  document.getElementById('btn-preview-font').addEventListener('click', generateText);

  // Sliders
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

  // Icon filter
  document.getElementById('icon-filter').addEventListener('input', e => {
    buildIconGrid(e.target.value);
  });

  // Editor — colours
  document.getElementById('btn-apply-color').addEventListener('click', applyColor);
  document.getElementById('btn-clear-colors').addEventListener('click', clearColors);
  document.getElementById('btn-add-border').addEventListener('click', addBorderToArt);

  // Editor — align / shift
  document.getElementById('btn-align-left').addEventListener('click',   () => alignArt('left'));
  document.getElementById('btn-align-center').addEventListener('click', () => alignArt('center'));
  document.getElementById('btn-align-right').addEventListener('click',  () => alignArt('right'));
  document.getElementById('btn-shift-left').addEventListener('click',   () => shiftArt('left'));
  document.getElementById('btn-shift-right').addEventListener('click',  () => shiftArt('right'));
  document.getElementById('btn-shift-up').addEventListener('click',     () => shiftArt('up'));
  document.getElementById('btn-shift-down').addEventListener('click',   () => shiftArt('down'));

  // Editor — clean
  document.getElementById('btn-trim-trailing').addEventListener('click', trimTrailing);
  document.getElementById('btn-trim-empty').addEventListener('click',    trimEmpty);

  // Editor — find & replace
  document.getElementById('btn-find-next').addEventListener('click',   findNext);
  document.getElementById('btn-replace-all').addEventListener('click', replaceAll);
  document.getElementById('find-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') findNext();
  });
  document.getElementById('replace-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') replaceAll();
  });

  // Editor — line tools
  document.getElementById('btn-line-before').addEventListener('click', () => insertLine('before'));
  document.getElementById('btn-line-after').addEventListener('click',  () => insertLine('after'));
  document.getElementById('btn-line-dup').addEventListener('click',    duplicateLine);
  document.getElementById('btn-line-del').addEventListener('click',    deleteLine);

  // Toolbar
  document.getElementById('btn-copy').addEventListener('click', copyArt);
  document.getElementById('btn-export-txt').addEventListener('click',  () => exportArt('txt'));
  document.getElementById('btn-export-html').addEventListener('click', () => exportArt('html'));
  document.getElementById('btn-export-ans').addEventListener('click',  () => exportArt('ans'));

  // Edit bar
  document.getElementById('btn-clear').addEventListener('click', clearCanvas);
  document.getElementById('btn-font-dec').addEventListener('click', () => changeFontSize(-1));
  document.getElementById('btn-font-inc').addEventListener('click', () => changeFontSize(+1));

  // Canvas — cursor tracking
  const canvas = document.getElementById('canvas');
  canvas.addEventListener('input',   updateDims);
  canvas.addEventListener('keyup',   saveRange);
  canvas.addEventListener('mouseup', saveRange);
  canvas.addEventListener('blur',    saveRange);
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

// ── Cursor tracking ───────────────────────────────────────────────────────────

function saveRange() {
  const canvas = document.getElementById('canvas');
  const sel    = window.getSelection();
  if (sel && sel.rangeCount && canvas.contains(sel.focusNode)) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
}

function getCursorLineIndex() {
  const canvas = document.getElementById('canvas');
  const sel    = window.getSelection();
  if (!sel || !sel.rangeCount) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  const pre   = document.createRange();
  pre.selectNodeContents(canvas);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().split('\n').length - 1;
}

// ── Generation ────────────────────────────────────────────────────────────────

async function generateText() {
  const text     = document.getElementById('gen-text').value.trim();
  if (!text) { status('Enter some text first'); return; }

  const font     = document.getElementById('font-select').value;
  const border   = document.getElementById('border-select').value;
  const width    = +document.getElementById('width-range').value;
  const centered = document.getElementById('centered-check').checked;
  const append   = document.getElementById('gen-append').checked;

  status('Generating…');
  try {
    const d = await api.post('/api/generate/text', { text, font, border, width, centered });
    if (d.error) { status(`Error: ${d.error}`); return; }
    applyToCanvas(d.art, append);
    status(`Font: ${font}  ·  ${d.cols}×${d.rows}`);
  } catch (e) {
    status(`Error: ${e.message}`);
  }
}

async function generateLlm() {
  const prompt = document.getElementById('llm-prompt').value.trim();
  if (!prompt) { status('Enter a prompt first'); return; }

  const append = document.getElementById('llm-append').checked;
  const btn    = document.getElementById('btn-llm-gen');
  btn.textContent = '⟳ Generating…';
  btn.disabled    = true;
  status('LLM generating…');

  try {
    const d = await api.post('/api/llm/generate', { prompt });
    if (d.error) {
      status(`LLM error: ${d.error}`);
    } else {
      applyToCanvas(d.art, append);
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

const POLL_INTERVALS = {
  loading:    2_000,   // fast — catch ready state quickly
  not_loaded: 15_000,  // slow — won't change until user clicks Load
  ready:      30_000,  // very slow — just a health check
  error:      15_000,  // slow — user needs to act
};

async function pollLlmStatus() {
  let nextDelay = 15_000;
  try {
    const d   = await api.get('/api/llm/status');
    const dot = document.getElementById('llm-dot');
    const lbl = document.getElementById('llm-label');
    const msgs = {
      ready:      'LLM: ready',
      loading:    'LLM: loading…',
      not_loaded: 'LLM: not loaded',
      error:      'LLM: error',
    };
    dot.className   = `dot ${d.status}`;
    lbl.textContent = msgs[d.status] || `LLM: ${d.status}`;
    if (d.message) lbl.title = d.message;
    nextDelay = POLL_INTERVALS[d.status] ?? 15_000;
  } catch { /* server not yet up — retry soon */ }
  setTimeout(pollLlmStatus, nextDelay);
}

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
  const append   = document.getElementById('img-append').checked;

  status('Converting image…');
  try {
    const d = await api.post('/api/generate/image', { image: imageBase64, width, char_set, invert });
    if (d.error) { status(`Error: ${d.error}`); return; }
    applyToCanvas(d.art, append);
    status(`Image converted  ·  ${d.cols}×${d.rows}`);
  } catch (e) {
    status(`Error: ${e.message}`);
  }
}

// ── Canvas write helpers ──────────────────────────────────────────────────────

function applyToCanvas(art, append) {
  if (append) {
    const current = document.getElementById('canvas').innerText.trim();
    setCanvas(current ? current + '\n\n' + art : art);
  } else {
    setCanvas(art);
  }
}

function insertTemplate(art) {
  const current = document.getElementById('canvas').innerText.trim();
  setCanvas(current ? current + '\n\n' + art : art);
  status('Template inserted');
}

function insertChar(char) {
  const canvas = document.getElementById('canvas');
  canvas.focus();

  const sel = window.getSelection();
  if (savedRange && canvas.contains(savedRange.commonAncestorContainer)) {
    sel.removeAllRanges();
    sel.addRange(savedRange);
    document.execCommand('insertText', false, char);
  } else {
    // No saved position — move to end and insert
    const r = document.createRange();
    r.selectNodeContents(canvas);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand('insertText', false, char);
  }

  saveRange();
  updateDims();
}

// ── Edit bar ──────────────────────────────────────────────────────────────────

function clearCanvas() {
  const btn = document.getElementById('btn-clear');
  if (btn.dataset.confirm === '1') {
    setCanvas('');
    status('Canvas cleared');
    btn.textContent   = 'Clear';
    btn.dataset.confirm = '0';
  } else {
    btn.textContent     = 'Confirm?';
    btn.dataset.confirm = '1';
    setTimeout(() => {
      btn.textContent     = 'Clear';
      btn.dataset.confirm = '0';
    }, 2500);
  }
}

function changeFontSize(delta) {
  fontSize = Math.max(8, Math.min(28, fontSize + delta));
  document.getElementById('canvas').style.fontSize      = fontSize + 'px';
  document.getElementById('font-size-display').textContent = fontSize + 'px';
}

// ── Editor — colours ──────────────────────────────────────────────────────────

function applyColor() {
  if (!selectedColor) { status('Select a colour first'); return; }
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) { status('Select text in the preview first'); return; }

  const range = sel.getRangeAt(0);
  const span  = document.createElement('span');
  span.style.color   = selectedColor.hex;
  span.dataset.color = selectedColor.name;
  try {
    range.surroundContents(span);
    updateDims();
    status(`Applied: ${selectedColor.name}`);
  } catch {
    status('Cannot colour across lines — select within a single line');
  }
}

function clearColors() {
  document.getElementById('canvas').querySelectorAll('span[data-color]').forEach(sp =>
    sp.replaceWith(document.createTextNode(sp.textContent))
  );
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
    status(`Border: ${style}`);
  } catch (e) {
    status(`Error: ${e.message}`);
  }
}

// ── Editor — align ────────────────────────────────────────────────────────────

function alignArt(dir) {
  const lines = document.getElementById('canvas').innerText.split('\n');
  const maxW  = Math.max(...lines.map(l => l.length), 0);
  let result;

  if (dir === 'left') {
    result = lines.map(l => l.trimStart());
  } else if (dir === 'center') {
    result = lines.map(l => {
      const s   = l.trim();
      const pad = Math.max(0, Math.floor((maxW - s.length) / 2));
      return ' '.repeat(pad) + s;
    });
  } else {
    result = lines.map(l => l.trimStart().padStart(maxW));
  }

  setCanvas(result.join('\n'));
  status(`Aligned: ${dir}`);
}

// ── Editor — shift ────────────────────────────────────────────────────────────

function shiftArt(dir) {
  const lines = document.getElementById('canvas').innerText.split('\n');
  let result;

  switch (dir) {
    case 'left':  result = lines.map(l => l.startsWith(' ') ? l.slice(1) : l); break;
    case 'right': result = lines.map(l => ' ' + l); break;
    case 'up':    result = lines.length > 1 ? lines.slice(1) : ['']; break;
    case 'down':  result = ['', ...lines]; break;
    default:      result = lines;
  }

  setCanvas(result.join('\n'));
  status(`Shifted: ${dir}`);
}

// ── Editor — clean ────────────────────────────────────────────────────────────

function trimTrailing() {
  const lines  = document.getElementById('canvas').innerText.split('\n');
  const result = lines.map(l => l.trimEnd());
  setCanvas(result.join('\n'));
  status('Trailing spaces trimmed');
}

function trimEmpty() {
  const lines  = document.getElementById('canvas').innerText.split('\n');
  let start    = 0;
  let end      = lines.length - 1;
  while (start <= end && !lines[start].trim()) start++;
  while (end >= start && !lines[end].trim()) end--;
  setCanvas(lines.slice(start, end + 1).join('\n'));
  status('Empty lines trimmed');
}

// ── Editor — find & replace ───────────────────────────────────────────────────

function findNext() {
  const term = document.getElementById('find-input').value;
  if (!term) { setFindStatus('Enter search text'); return; }

  const text  = document.getElementById('canvas').innerText;
  const idx   = text.indexOf(term, findOffset);

  if (idx === -1) {
    findOffset = 0;
    const from = text.indexOf(term);
    if (from === -1) { setFindStatus(`"${term}" not found`); return; }
    // Wrap around
    setFindStatus('Wrapped to top');
    findOffset = from + term.length;
    highlightOccurrence(from, term.length);
  } else {
    findOffset = idx + term.length;
    setFindStatus(`Found at position ${idx}`);
    highlightOccurrence(idx, term.length);
  }
}

function highlightOccurrence(charIdx, len) {
  const canvas = document.getElementById('canvas');
  canvas.focus();

  // Walk text nodes to find character position
  const iter = document.createNodeIterator(canvas, NodeFilter.SHOW_TEXT);
  let node, offset = 0;
  while ((node = iter.nextNode())) {
    const end = offset + node.textContent.length;
    if (charIdx < end) {
      const startOff = charIdx - offset;
      const endOff   = Math.min(startOff + len, node.textContent.length);
      const range    = document.createRange();
      range.setStart(node, startOff);
      range.setEnd(node, endOff);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      savedRange = range.cloneRange();
      return;
    }
    offset = end;
  }
}

function replaceAll() {
  const term    = document.getElementById('find-input').value;
  const replace = document.getElementById('replace-input').value;
  if (!term) { setFindStatus('Enter search text'); return; }

  const text  = document.getElementById('canvas').innerText;
  const count = (text.split(term).length - 1);
  if (count === 0) { setFindStatus(`"${term}" not found`); return; }

  setCanvas(text.split(term).join(replace));
  findOffset = 0;
  setFindStatus(`Replaced ${count} occurrence${count !== 1 ? 's' : ''}`);
}

function setFindStatus(msg) {
  document.getElementById('find-status').textContent = msg;
}

// ── Editor — line tools ───────────────────────────────────────────────────────

function insertLine(position) {
  const canvas = document.getElementById('canvas');
  canvas.focus();

  const lines = canvas.innerText.split('\n');
  const idx   = getCursorLineIndex();

  if (position === 'before') {
    lines.splice(idx, 0, '');
  } else {
    lines.splice(idx + 1, 0, '');
  }

  setCanvas(lines.join('\n'));
  status(`Line inserted ${position}`);
}

function duplicateLine() {
  const canvas = document.getElementById('canvas');
  const lines  = canvas.innerText.split('\n');
  const idx    = getCursorLineIndex();

  if (idx < 0 || idx >= lines.length) return;
  lines.splice(idx + 1, 0, lines[idx]);
  setCanvas(lines.join('\n'));
  status('Line duplicated');
}

function deleteLine() {
  const canvas = document.getElementById('canvas');
  const lines  = canvas.innerText.split('\n');
  const idx    = getCursorLineIndex();

  if (lines.length <= 1) { setCanvas(''); status('Canvas cleared'); return; }
  lines.splice(idx, 1);
  setCanvas(lines.join('\n'));
  status(`Line ${idx + 1} deleted`);
}

// ── Export ────────────────────────────────────────────────────────────────────

async function copyArt() {
  const text = document.getElementById('canvas').innerText;
  try {
    await navigator.clipboard.writeText(text);
    status('Copied to clipboard');
  } catch {
    status('Clipboard blocked — use Ctrl+A then Ctrl+C in the preview');
  }
}

function exportArt(fmt) {
  const canvas = document.getElementById('canvas');

  if (fmt === 'html') {
    const blob = new Blob([
      '<!DOCTYPE html><html><head><meta charset="UTF-8">',
      '<style>body{background:#111;color:#00ff44;font-family:monospace;',
      'white-space:pre;padding:16px;line-height:1.2;}</style></head>',
      `<body>${canvas.innerHTML}</body></html>`,
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
  document.getElementById('canvas').textContent = art;
  updateDims();
}

function updateDims() {
  const lines = document.getElementById('canvas').innerText.split('\n');
  const cols  = Math.max(...lines.map(l => l.length), 0);
  document.getElementById('art-dims').textContent = `${cols} × ${lines.length} chars`;
}

function status(msg) {
  document.getElementById('status-msg').textContent = msg;
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Start ─────────────────────────────────────────────────────────────────────
boot();
