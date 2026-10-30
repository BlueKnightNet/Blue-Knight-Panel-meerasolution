"""Exercise the private boundary without downloading native engines."""
import http.client
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from types import SimpleNamespace
from http.server import ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("telegram_service", ROOT / "telegram/service.py")
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.proxy = service.Proxy(Path(self.temp.name))
        self.proxy.status = lambda: {"running": True, "tg_link": "must-be-hidden", "web_link": "must-be-hidden", "network_ready": True}
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), service.make_handler(self.proxy, "test-adapter-key"))
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.temp.cleanup()

    def request(self, method, path, data=None, authorized=True):
        conn = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        headers = {"X-Telegram-Adapter": "test-adapter-key"} if authorized else {}
        body = json.dumps(data) if data is not None else None
        conn.request(method, path, body, headers)
        response = conn.getresponse()
        result = response.status, response.read()
        conn.close()
        return result

    def test_private_boundary_and_native_claims(self):
        self.assertEqual(self.request("GET", "/status", authorized=False)[0], 403)
        code, raw = self.request("GET", "/status")
        self.assertEqual(code, 200)
        status = json.loads(raw)
        self.assertFalse(status["network_ready"])
        self.assertEqual(status["tg_link"], "")
        self.assertEqual(self.request("POST", "/_webbridge/test", {})[0], 404)
        self.assertEqual(self.request("POST", "/worker", [])[0], 400)

    def test_worker_uses_each_deployments_domain(self):
        for host in ["first-app.deploy.meerasolution.com", "another-app.deploy.meerasolution.com"]:
            code, source = self.request("POST", "/worker", {"origin": "https://" + host})
            self.assertEqual(code, 200)
            self.assertIn(host.encode(), source)
            self.assertIn(self.proxy.bridge["token"].encode(), source)
        for origin in ["https://127.0.0.1", "http://first-app.deploy.meerasolution.com", "https://evil.example", "https://app.deploy.meerasolution.com@evil.example", "https://app.deploy.meerasolution.com/path"]:
            self.assertEqual(self.request("POST", "/worker", {"origin": origin})[0], 400, origin)


if __name__ == "__main__":
    unittest.main()
