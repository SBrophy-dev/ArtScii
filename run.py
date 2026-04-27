"""
ArtScii — ASCII Art Studio
Usage:
    python run.py              # web dashboard (default)
    python run.py --web        # web dashboard
    python run.py --tui        # terminal UI
    python run.py --web --open # open browser automatically
    python run.py --port 8080  # custom port
"""

import argparse
import sys


def main() -> None:
    p = argparse.ArgumentParser(description='ArtScii — ASCII Art Studio')
    p.add_argument('--web',   action='store_true', help='Launch web dashboard (default)')
    p.add_argument('--tui',   action='store_true', help='Launch terminal UI')
    p.add_argument('--host',  default='127.0.0.1', help='Web host (default: 127.0.0.1)')
    p.add_argument('--port',  type=int, default=5000, help='Web port (default: 5000)')
    p.add_argument('--open',  action='store_true', help='Open browser automatically')
    p.add_argument('--debug', action='store_true', help='Flask debug mode')
    args = p.parse_args()

    if args.tui:
        _run_tui()
    else:
        _run_web(args)


def _run_tui() -> None:
    try:
        from app.tui import run
    except ImportError as exc:
        print(f'TUI dependencies missing: {exc}')
        print('Run:  pip install textual rich')
        sys.exit(1)
    run()


def _run_web(args) -> None:
    try:
        from app.server import run
    except ImportError as exc:
        print(f'Web dependencies missing: {exc}')
        print('Run:  pip install flask pyfiglet Pillow')
        sys.exit(1)

    url = f'http://{args.host}:{args.port}'

    if args.open:
        import threading, webbrowser
        threading.Timer(1.2, lambda: webbrowser.open(url)).start()

    print(f'ArtScii  →  {url}')
    print('Ctrl+C to stop\n')
    run(host=args.host, port=args.port, debug=args.debug)


if __name__ == '__main__':
    main()
