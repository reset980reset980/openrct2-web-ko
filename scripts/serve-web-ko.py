#!/usr/bin/env python3
from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class WebAssemblyHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".wasm": "application/wasm",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
    }

    def end_headers(self) -> None:
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenRCT2 Web 한국어 로컬 검증 서버")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--directory", type=Path, default=Path("build/www"))
    args = parser.parse_args()
    directory = args.directory.resolve()
    if not directory.is_dir():
        raise SystemExit(f"배포 디렉터리가 없습니다: {directory}")

    def handler(*handler_args, **handler_kwargs):
        return WebAssemblyHandler(*handler_args, directory=str(directory), **handler_kwargs)

    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"OpenRCT2 Web 한국어: http://127.0.0.1:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
