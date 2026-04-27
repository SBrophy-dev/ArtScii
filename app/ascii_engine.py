import pyfiglet
from PIL import Image

ASCII_CHARS_STANDARD = '@%#*+=-:. '
ASCII_CHARS_BLOCKS   = '█▓▒░ '
ASCII_CHARS_MINIMAL  = '@:. '
ASCII_CHARS_DETAILED = r'$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\|()1{}[]?-_+~<>i!lI;:,"^`\'. '

CHAR_SETS = {
    'standard': ASCII_CHARS_STANDARD,
    'blocks':   ASCII_CHARS_BLOCKS,
    'minimal':  ASCII_CHARS_MINIMAL,
    'detailed': ASCII_CHARS_DETAILED,
}

BORDER_STYLES = {
    'single':  ('┌', '─', '┐', '│', '└', '┘'),
    'double':  ('╔', '═', '╗', '║', '╚', '╝'),
    'rounded': ('╭', '─', '╮', '│', '╰', '╯'),
    'heavy':   ('┏', '━', '┓', '┃', '┗', '┛'),
    'ascii':   ('+', '-', '+', '|', '+', '+'),
}


def list_fonts() -> list[str]:
    return sorted(pyfiglet.FigletFont.getFonts())


def text_to_ascii(text: str, font: str = 'standard', width: int = 80) -> str:
    try:
        fig = pyfiglet.Figlet(font=font, width=width)
        return fig.renderText(text)
    except pyfiglet.FontNotFound:
        fig = pyfiglet.Figlet(font='standard', width=width)
        return fig.renderText(text)


def image_to_ascii(
    image_path: str,
    width: int = 80,
    char_set: str = 'standard',
    invert: bool = False,
) -> str:
    chars = CHAR_SETS.get(char_set, ASCII_CHARS_STANDARD)
    img = Image.open(image_path).convert('L')

    # Correct for terminal character aspect ratio (~2:1 tall:wide)
    aspect = img.height / img.width
    height = max(1, int(width * aspect * 0.45))
    img = img.resize((width, height), Image.LANCZOS)

    pixels = list(img.getdata())
    n = len(chars)

    def map_pixel(p: int) -> str:
        idx = int(p / 255 * (n - 1))
        return chars[n - 1 - idx] if invert else chars[idx]

    mapped = [map_pixel(p) for p in pixels]
    lines = [''.join(mapped[i : i + width]) for i in range(0, len(mapped), width)]
    return '\n'.join(lines)


def add_border(art: str, style: str = 'single') -> str:
    tl, h, tr, v, bl, br = BORDER_STYLES.get(style, BORDER_STYLES['single'])

    lines = art.rstrip('\n').split('\n')
    inner_w = max((len(line) for line in lines), default=0)

    top    = tl + h * (inner_w + 2) + tr
    bottom = bl + h * (inner_w + 2) + br
    rows   = [f'{v} {line.ljust(inner_w)} {v}' for line in lines]

    return '\n'.join([top, *rows, bottom])


def center_art(art: str, width: int = 80) -> str:
    lines = art.split('\n')
    max_w = max((len(l) for l in lines), default=0)
    pad   = max(0, (width - max_w) // 2)
    return '\n'.join(' ' * pad + l for l in lines)


def art_dimensions(art: str) -> tuple[int, int]:
    lines = art.split('\n')
    cols = max((len(l) for l in lines), default=0)
    return cols, len(lines)
