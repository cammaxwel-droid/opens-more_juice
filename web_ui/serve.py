"""
Local static + reverse-proxy server for my_new_tool Web Workbench.

Serves the static Carbon Crimson UI on http://127.0.0.1:3000 (by default) and
proxies /api/* requests to http://127.0.0.1:8080/* so browser fetch calls avoid
CORS preflight errors without modifying my_new_tool/server.py.

Usage:
    python serve.py
    python serve.py --port 3000 --backend http://127.0.0.1:8080
    python serve.py --with-backend   # also launches `python -m my_new_tool --server 127.0.0.1:8080`
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import subprocess
import sys
import urllib.error
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent


class WorkbenchHandler(SimpleHTTPRequestHandler):
    """Serves static UI files and forwards /api/* to the FastAPI backend."""

    def __init__(self, *args, backend_url: str, directory: str, **kwargs):
        self.backend_url = backend_url.rstrip("/")
        super().__init__(*args, directory=directory, **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write(f"[workbench] {self.address_string()} - {fmt % args}\n")

    def do_GET(self) -> None:
        if self.path == "/api" or self.path.startswith("/api/"):
            self._proxy_request("GET")
            return
        super().do_GET()

    def do_POST(self) -> None:
        if self.path == "/api" or self.path.startswith("/api/"):
            self._proxy_request("POST")
            return
        self.send_error(405, "Method Not Allowed")

    def _proxy_request(self, method: str) -> None:
        subpath = self.path[len("/api") :] or "/"
        target_url = f"{self.backend_url}{subpath}"

        body = None
        if method in ("POST", "PUT", "PATCH"):
            length = int(self.headers.get("Content-Length", "0") or "0")
            body = self.rfile.read(length) if length > 0 else b""

        headers = {"Accept": self.headers.get("Accept", "application/json")}
        if self.headers.get("Content-Type"):
            headers["Content-Type"] = self.headers["Content-Type"]

        req = urllib.request.Request(target_url, data=body, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read()
                self.send_response(resp.status)
                content_type = resp.headers.get("Content-Type", "application/json")
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(raw)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(raw)
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            self.send_response(exc.code)
            self.send_header("Content-Type", exc.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            self.wfile.write(raw)
        except Exception as exc:  # noqa: BLE001
            payload = json.dumps(
                {
                    "detail": (
                        f"Cannot reach FastAPI backend at {self.backend_url} ({exc}). "
                        "Ensure `python -m my_new_tool --server 127.0.0.1:8080` is running."
                    )
                }
            ).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)



def _port_open(host: str, port: int, timeout: float = 0.35) -> bool:
    import socket
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False

def main() -> None:
    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")

    parser = argparse.ArgumentParser(description="Serve my_new_tool Web Workbench with /api proxy.")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "3000")), help="Bind port (default: 3000)")
    parser.add_argument(
        "--backend",
        default=os.environ.get("BACKEND_URL", "http://127.0.0.1:8080"),
        help="FastAPI backend URL (default: http://127.0.0.1:8080)",
    )
    parser.add_argument(
        "--with-backend",
        action="store_true",
        help="Also spawn `python -m my_new_tool --server 127.0.0.1:8080` as a child process.",
    )
    args = parser.parse_args()

    backend_proc = None
    if args.with_backend:
        from urllib.parse import urlparse
        _parsed = urlparse(args.backend)
        _b_host = _parsed.hostname or '127.0.0.1'
        _b_port = _parsed.port or 8080
        if _port_open(_b_host, _b_port):
            print(f'Backend already listening at {args.backend} — reusing existing server.')
            args.with_backend = False
    if args.with_backend:
        backend_addr = args.backend.removeprefix("http://").removeprefix("https://").split("/")[0]
        backend_proc = subprocess.Popen([sys.executable, "-m", "my_new_tool", "--server", backend_addr])

    handler = partial(WorkbenchHandler, backend_url=args.backend, directory=str(ROOT_DIR))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"my_new_tool Web Workbench listening at http://{args.host}:{args.port}")
    print(f"Proxying /api/* -> {args.backend}/*")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down workbench server...")
    finally:
        server.server_close()
        if backend_proc is not None:
            backend_proc.terminate()


if __name__ == "__main__":
    main()
