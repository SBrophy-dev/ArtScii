import time
from pathlib import Path

from rich.text import Text
from textual import work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.reactive import reactive
from textual.widgets import (
    Button, Footer, Header, Input, Label, Select, Static, TextArea,
)

from app.ascii_engine import (
    add_border, art_dimensions, list_fonts, text_to_ascii,
)
from app.ansi import PALETTE, colorize, strip_ansi

# ── Helpers ───────────────────────────────────────────────────────────────────

_EXPORT_DIR = Path('exports')

_BORDER_OPTIONS = [
    ('None', 'none'), ('Single ─', 'single'), ('Double ═', 'double'),
    ('Rounded ╭', 'rounded'), ('Heavy ━', 'heavy'), ('ASCII +', 'ascii'),
]

_COLOR_NAMES = [p['name'] for p in PALETTE]
_COLOR_OPTS  = [(p['name'].replace('_', ' ').title(), p['name']) for p in PALETTE]


# ── Widgets ───────────────────────────────────────────────────────────────────

class ArtPreview(Static):
    """Read-only Rich-rendered ASCII art panel."""

    DEFAULT_CSS = """
    ArtPreview {
        height: 1fr;
        background: #080808;
        color: #00ff44;
        border: solid #2a2a2a;
        overflow: auto;
        padding: 1;
    }
    """

    def set_art(self, art: str) -> None:
        safe = art.replace('[', r'\[')
        self.update(safe)


class StatusBar(Label):
    DEFAULT_CSS = """
    StatusBar {
        height: 1;
        background: #111111;
        color: #666666;
        padding: 0 1;
    }
    """


# ── Main App ──────────────────────────────────────────────────────────────────

class ArtSciiTUI(App):
    TITLE   = 'ArtScii — ASCII Art Studio'
    CSS_PATH = None

    CSS = """
    Screen { background: #0a0a0a; }

    #layout { height: 1fr; }

    #sidebar {
        width: 36;
        background: #111111;
        border-right: solid #2a2a2a;
        padding: 1 1 0 1;
        overflow-y: auto;
    }

    #right { padding: 0 1 0 0; }

    .section {
        color: #00ff44;
        text-style: bold;
        margin-top: 1;
        margin-bottom: 0;
    }

    Label.field {
        color: #666666;
        text-transform: uppercase;
        margin-top: 1;
        margin-bottom: 0;
    }

    Input {
        background: #1a1a1a;
        border: tall #2a2a2a;
        color: #ffffff;
        margin-bottom: 0;
    }
    Input:focus { border: tall #006622; }

    Select {
        background: #1a1a1a;
        margin-bottom: 0;
    }

    Button {
        width: 100%;
        margin-top: 1;
    }
    Button.primary  { background: #006622; color: #00ff44; }
    Button.llm      { background: #223388; color: #8899ff; }
    Button.action   { background: #1a1a1a; color: #cccccc; }
    Button:hover    { tint: white 20%; }

    #preview-label {
        color: #00ff44;
        text-style: bold;
        padding: 0 0 0 0;
    }

    #dim-label {
        color: #444444;
        padding: 0;
    }
    """

    BINDINGS = [
        Binding('ctrl+g', 'generate',    'Generate',  show=True),
        Binding('ctrl+l', 'llm_gen',     'LLM Gen',   show=True),
        Binding('ctrl+e', 'export_txt',  'Export',    show=True),
        Binding('ctrl+r', 'random_font', 'Rnd Font',  show=True),
        Binding('q',      'quit',        'Quit',      show=True),
    ]

    current_art: reactive[str] = reactive('')

    # ── UI ────────────────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Header()
        with Horizontal(id='layout'):
            with Vertical(id='sidebar'):
                yield Label('── GENERATOR ──', classes='section')
                yield Label('Text', classes='field')
                yield Input(placeholder='Enter text…', id='text-input')
                yield Label('Font', classes='field')
                yield Input(placeholder='Search fonts…', id='font-search')
                yield Select(
                    [(f, f) for f in list_fonts()],
                    id='font-select',
                    value='standard',
                )
                yield Label('Border', classes='field')
                yield Select(_BORDER_OPTIONS, id='border-select', value='none')
                yield Button('Generate  Ctrl+G', id='gen-btn', classes='primary')

                yield Label('── LLM ──', classes='section')
                yield Label('Prompt', classes='field')
                yield Input(placeholder='e.g. Banner for "SB Tech"', id='llm-input')
                yield Button('Generate with LLM  Ctrl+L', id='llm-btn', classes='llm')
                yield Button('Load Model', id='load-btn', classes='action')
                yield Label('', id='llm-status')

                yield Label('── COLORS ──', classes='section')
                yield Label('Foreground', classes='field')
                yield Select(_COLOR_OPTS, id='color-select', value='green')
                yield Button('Apply color to art', id='color-btn', classes='action')

                yield Label('── ACTIONS ──', classes='section')
                yield Button('Export .txt  Ctrl+E', id='export-btn', classes='action')
                yield Button('Clear', id='clear-btn', classes='action')

            with Vertical(id='right'):
                with Horizontal():
                    yield Label('Preview', id='preview-label')
                    yield Label('', id='dim-label')
                yield ArtPreview(id='preview')
        yield StatusBar('Ready', id='statusbar')
        yield Footer()

    def on_mount(self) -> None:
        self._refresh_font_list(list_fonts())
        self._check_llm_status()

    # ── Events ────────────────────────────────────────────────────────────────

    def on_input_changed(self, event: Input.Changed) -> None:
        if event.input.id == 'font-search':
            q     = event.value.lower()
            fonts = [f for f in list_fonts() if q in f] if q else list_fonts()
            self._refresh_font_list(fonts)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        handlers = {
            'gen-btn':    self.action_generate,
            'llm-btn':    self.action_llm_gen,
            'load-btn':   self._load_llm,
            'color-btn':  self._apply_color,
            'export-btn': self.action_export_txt,
            'clear-btn':  self._clear,
        }
        fn = handlers.get(event.button.id)
        if fn:
            fn()

    # ── Actions ───────────────────────────────────────────────────────────────

    def action_generate(self) -> None:
        text = self.query_one('#text-input', Input).value.strip()
        if not text:
            self._status('Enter text first')
            return
        font   = str(self.query_one('#font-select', Select).value or 'standard')
        border = str(self.query_one('#border-select', Select).value or 'none')
        art    = text_to_ascii(text, font=font)
        if border != 'none':
            art = add_border(art, style=border)
        self._set_art(art)
        self._status(f'Generated with font: {font}')

    def action_llm_gen(self) -> None:
        self._llm_generate()

    def action_export_txt(self) -> None:
        self._export()

    def action_random_font(self) -> None:
        import random
        fonts = list_fonts()
        font  = random.choice(fonts)
        sel   = self.query_one('#font-select', Select)
        sel.value = font
        self._status(f'Font: {font}')

    # ── LLM ───────────────────────────────────────────────────────────────────

    @work(thread=True)
    def _llm_generate(self) -> None:
        from app.llm import get_llm
        prompt = self.query_one('#llm-input', Input).value.strip()
        if not prompt:
            self.call_from_thread(self._status, 'Enter a prompt first')
            return

        self.call_from_thread(self._status, 'LLM generating…')
        llm    = get_llm()
        result = llm.generate(prompt)
        art    = result.get('art', result.get('error', 'Generation failed'))
        self.call_from_thread(self._set_art, art)
        self.call_from_thread(self._status, f'LLM done ({result.get("type", "?")})')

    @work(thread=True)
    def _load_llm(self) -> None:
        from app.llm import get_llm
        self.call_from_thread(self._status, 'Loading model…')
        llm = get_llm()
        llm.load_async()
        while llm.loading:
            time.sleep(0.5)
        st = llm.status()
        msg = 'Model ready ✓' if st['status'] == 'ready' else f'Error: {st.get("message", "unknown")}'
        self.call_from_thread(self._status, msg)
        self.call_from_thread(self._update_llm_label, st['status'])

    def _check_llm_status(self) -> None:
        from app.llm import get_llm
        st = get_llm().status()
        self._update_llm_label(st['status'])

    def _update_llm_label(self, status: str) -> None:
        labels = {
            'ready':      '[green]● Model ready[/green]',
            'loading':    '[yellow]◌ Loading…[/yellow]',
            'not_loaded': '[dim]○ Not loaded[/dim]',
            'error':      '[red]✗ Error[/red]',
        }
        lbl = self.query_one('#llm-status', Label)
        lbl.update(labels.get(status, status))

    # ── Colors ────────────────────────────────────────────────────────────────

    def _apply_color(self) -> None:
        if not self.current_art:
            self._status('Generate art first')
            return
        color = str(self.query_one('#color-select', Select).value or 'green')
        colored = colorize(self.current_art, foreground=color)
        self._set_art(colored)
        self._status(f'Applied color: {color}')

    # ── Export ────────────────────────────────────────────────────────────────

    def _export(self) -> None:
        if not self.current_art:
            self._status('Nothing to export')
            return
        _EXPORT_DIR.mkdir(exist_ok=True)
        path = _EXPORT_DIR / 'art.txt'
        path.write_text(strip_ansi(self.current_art), encoding='utf-8')
        self._status(f'Exported → {path}')

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _set_art(self, art: str) -> None:
        self.current_art = art
        self.query_one('#preview', ArtPreview).set_art(art)
        cols, rows = art_dimensions(strip_ansi(art))
        self.query_one('#dim-label', Label).update(f'  [{cols}×{rows}]')

    def _clear(self) -> None:
        self._set_art('')
        self._status('Cleared')

    def _status(self, msg: str) -> None:
        self.query_one('#statusbar', StatusBar).update(msg)

    def _refresh_font_list(self, fonts: list[str]) -> None:
        sel = self.query_one('#font-select', Select)
        sel.set_options([(f, f) for f in fonts])


def run() -> None:
    ArtSciiTUI().run()
