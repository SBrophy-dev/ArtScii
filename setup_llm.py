"""
Install llama-cpp-python with pre-built CPU wheels (no MSVC / build tools needed).

Run this once before using the LLM features:
    python setup_llm.py
"""

import subprocess
import sys

# Pre-built CPU-only wheels from the llama-cpp-python author
CPU_WHEEL_INDEX = 'https://abetlen.github.io/llama-cpp-python/whl/cpu'


def install() -> None:
    print('Installing llama-cpp-python (CPU-only, pre-built wheels) …\n')

    result = subprocess.run(
        [
            sys.executable, '-m', 'pip', 'install',
            'llama-cpp-python',
            '--extra-index-url', CPU_WHEEL_INDEX,
            '--upgrade',
        ],
        check=False,
    )

    if result.returncode == 0:
        print('\nDone — llama-cpp-python installed (CPU).')
        print('Next step:  python download_model.py')
        return

    print('\nPre-built wheel not found for this Python version.')
    print('Falling back to source build (requires MSVC Build Tools on Windows) …\n')

    fallback = subprocess.run(
        [sys.executable, '-m', 'pip', 'install', 'llama-cpp-python'],
        check=False,
    )

    if fallback.returncode != 0:
        print('\nSource build also failed.')
        print('Install MSVC Build Tools from:')
        print('  https://visualstudio.microsoft.com/visual-cpp-build-tools/')
        print('Then re-run this script.')
        sys.exit(1)

    print('\nSource build succeeded.')
    print('Next step:  python download_model.py')


if __name__ == '__main__':
    install()
