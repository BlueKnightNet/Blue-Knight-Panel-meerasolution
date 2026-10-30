"""Private Telemt adapter. The Node panel owns public authentication and routing."""
import hmac
import json
import os
from pathlib import Path
import signal
import sys
import threading
import time
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit

VENDOR = Path(__file__).resolve().parent / "vendor"
sys.path.insert(0, str(VENDOR))
import main as installer
from panel.server import App, Proxy, handler_for, standalone_worker


def make_handler(proxy, token):
    base = handler_for(App(proxy, "adapter-only"))

    class Handler(base):
        def authorized(self):
            return hmac.compare_digest(self.headers.get("X-Telegram-Adapter", ""), token)

        def dispatch(self):
            if not self.authorized():
                return self.reply(403, {"error": "Forbidden"})
            route = urlsplit(self.path).path
            if route.startswith("/_webbridge/"):
                return self.relay_web()
            if self.command == "GET" and route == "/status":
                status = proxy.status()
                # HTTP ingress does not prove native TCP reachability.
                status.update(tg_link="", web_link="", network_ready=False,
                              native_note="Native MTProto is unavailable through this HTTPS ingress. Test the WEB bridge with a compatible Telegram client.")
                return self.reply(200, status)
            if self.command == "POST" and route in ("/bridge", "/settings", "/worker"):
                try:
                    self.connection.settimeout(10)
                    if self.headers.get("Transfer-Encoding"):
                        return self.reply(400, {"error": "Content-Length required"})
                    size = int(self.headers.get("Content-Length", "0"))
                    if not 0 < size <= 8192:
                        return self.reply(413, {"error": "Invalid body size"})
                    data = json.loads(self.rfile.read(size))
                    if not isinstance(data, dict):
                        raise ValueError("Expected a JSON object")
                    if route == "/worker":
                        origin = urlsplit(data.get("origin", ""))
                        import re
                        if origin.scheme != "https" or origin.port not in (None, 443) or origin.username or origin.password or origin.path or origin.query or origin.fragment or not re.fullmatch(r"[a-z0-9-]+\.(?:deploy\.meerasolution\.com|ms-host\.com)", origin.hostname or ""):
                            raise ValueError("Open the panel through your Meera app HTTPS domain first")
                        # Persist the authenticated deployment origin for bridge status/downloads.
                        proxy.network.origin = origin.geturl()
                        proxy.network.persist()
                        return self.reply(200, standalone_worker(proxy), "text/javascript; charset=utf-8", filename="blue-knight-worker-private.mjs")
                    if route == "/bridge":
                        proxy.apply_bridge(data)
                    else:
                        proxy.apply(data)
                    return self.reply(200, {"ok": True})
                except (ValueError, TypeError, OSError) as error:
                    return self.reply(400, {"error": str(error)})
            return self.reply(404, {"error": "Not found"})

        do_GET = dispatch
        do_POST = dispatch
        do_HEAD = dispatch
        do_DELETE = dispatch

    return Handler


def main():
    os.umask(0o077)
    directory = Path(os.environ["BK_TELEGRAM_DATA"])
    directory.mkdir(parents=True, exist_ok=True)
    # Installer cache belongs on the writable data volume, never the application tree.
    installer.ROOT = directory
    os.environ["TELEMT_BIN"] = str(installer.install_engine())
    proxy = Proxy(directory)
    server = ThreadingHTTPServer(("127.0.0.1", int(os.environ["BK_TELEGRAM_PORT"])),
                                 make_handler(proxy, os.environ["BK_TELEGRAM_TOKEN"]))
    proxy.start()
    def stop(*_):
        proxy.stop()
        os._exit(0)
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print("[telegram] Private adapter started", flush=True)
    while True:
        time.sleep(2)
        if not proxy.switching:
            with proxy.lock:
                if proxy.process.poll() is not None:
                    print("[telegram] Restarting Telemt", flush=True)
                    proxy.start()
                else:
                    proxy.sample_usage()


if __name__ == "__main__":
    main()
