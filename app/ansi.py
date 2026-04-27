import re

ESC   = '\033['
RESET = f'{ESC}0m'

# Standard 16 foreground color codes
FG_CODES = {
    'black':          30, 'red':          31, 'green':       32, 'yellow':      33,
    'blue':           34, 'magenta':      35, 'cyan':        36, 'white':       37,
    'bright_black':   90, 'bright_red':   91, 'bright_green': 92, 'bright_yellow': 93,
    'bright_blue':    94, 'bright_magenta': 95, 'bright_cyan': 96, 'bright_white': 97,
}

# ANSI code → CSS hex (terminal default palette)
ANSI_TO_HEX = {
    30: '#2e3436', 31: '#cc0000', 32: '#4e9a06', 33: '#c4a000',
    34: '#3465a4', 35: '#75507b', 36: '#06989a', 37: '#d3d7cf',
    90: '#555753', 91: '#ef2929', 92: '#8ae234', 93: '#fce94f',
    94: '#729fcf', 95: '#ad7fa8', 96: '#34e2e2', 97: '#eeeeec',
}
BG_TO_HEX = {k + 10: v for k, v in ANSI_TO_HEX.items()}

PALETTE = [
    {'name': name, 'code': code, 'hex': ANSI_TO_HEX[code]}
    for name, code in FG_CODES.items()
    if code in ANSI_TO_HEX
]


def fg(color) -> str:
    if isinstance(color, str):
        code = FG_CODES.get(color.lower())
        return f'{ESC}{code}m' if code else ''
    if isinstance(color, int):
        return f'{ESC}38;5;{color}m'
    if isinstance(color, tuple) and len(color) == 3:
        r, g, b = color
        return f'{ESC}38;2;{r};{g};{b}m'
    return ''


def bg(color) -> str:
    if isinstance(color, str):
        code = FG_CODES.get(color.lower())
        return f'{ESC}{code + 10}m' if code else ''
    if isinstance(color, int):
        return f'{ESC}48;5;{color}m'
    if isinstance(color, tuple) and len(color) == 3:
        r, g, b = color
        return f'{ESC}48;2;{r};{g};{b}m'
    return ''


def colorize(text: str, foreground=None, background=None, bold: bool = False) -> str:
    prefix = ''
    if bold:
        prefix += f'{ESC}1m'
    if foreground:
        prefix += fg(foreground)
    if background:
        prefix += bg(background)
    return f'{prefix}{text}{RESET}' if prefix else text


def strip_ansi(text: str) -> str:
    return re.sub(r'\033\[[0-9;]*m', '', text)


def ansi_to_html(text: str) -> str:
    """Convert ANSI escape codes in text to HTML <span> elements."""
    _escape_re = re.compile(r'\033\[([0-9;]*)m')

    def html_escape(s: str) -> str:
        return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    parts    = _escape_re.split(text)
    out      = []
    open_span = False
    cur_fg   = None
    cur_bg   = None
    bold     = False

    for i, chunk in enumerate(parts):
        if i % 2 == 0:
            # Plain text
            out.append(html_escape(chunk).replace('\n', '<br>'))
        else:
            # ANSI code sequence
            if open_span:
                out.append('</span>')
                open_span = False

            codes = [int(c) for c in chunk.split(';') if c.isdigit()] if chunk else [0]
            for code in codes:
                if code == 0:
                    cur_fg, cur_bg, bold = None, None, False
                elif code == 1:
                    bold = True
                elif code in ANSI_TO_HEX:
                    cur_fg = ANSI_TO_HEX[code]
                elif code in BG_TO_HEX:
                    cur_bg = BG_TO_HEX[code]

            styles = []
            if cur_fg:
                styles.append(f'color:{cur_fg}')
            if cur_bg:
                styles.append(f'background:{cur_bg}')
            if bold:
                styles.append('font-weight:bold')

            if styles:
                out.append(f'<span style="{";".join(styles)}">')
                open_span = True

    if open_span:
        out.append('</span>')

    return ''.join(out)
