"""Compatibility transport only. The Mac remains the sole dashboard/data owner."""
import hashlib
import hmac
import http.client
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

UPSTREAM = 'tara-macbook-pro.tail1bbd6f.ts.net'


def authorised(path, cookie_header, digest):
    try:
        query = parse_qs(urlsplit(path).query)
        cookies = SimpleCookie()
        cookies.load(cookie_header or '')
        value = query['key'][0] if 'key' in query else cookies['frame_session'].value
        return hmac.compare_digest(hashlib.sha256(value.encode()).hexdigest(), digest)
    except (KeyError, ValueError):
        return False


class Relay(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass  # URLs and cookies contain private credentials.

    def forward(self):
        addr = ipaddress.ip_address(self.client_address[0])
        if (addr not in ipaddress.ip_network('192.168.50.0/24')
                or not self.path.startswith('/') or self.path.startswith('//')
                or not authorised(self.path, self.headers.get('Cookie'), self.server.digest)):
            self.send_error(403, 'Private dashboard')
            return
        if self.headers.get('Host') != '192.168.50.111:8788':
            self.send_error(403)
            return
        if self.command == 'POST' and self.headers.get('Origin') != 'http://192.168.50.111:8788':
            self.send_error(403, 'Same-origin navigation required')
            return
        if self.command == 'POST' and urlsplit(self.path).path != '/api/navigation':
            self.send_error(405)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size < 0 or size > 4096 or self.headers.get('Transfer-Encoding'):
                self.send_error(413)
                return
            self.connection.settimeout(15)
            body = self.rfile.read(size) if size else None
            headers = {k: self.headers[k] for k in ('Cookie', 'Content-Type') if k in self.headers}
            if self.command == 'POST':
                headers['Origin'] = 'https://' + UPSTREAM + ':8443'
            conn = http.client.HTTPSConnection(UPSTREAM, 8443, timeout=15)
            try:
                conn.request(self.command, self.path, body=body, headers=headers)
                response = conn.getresponse()
                data = response.read()
                self.send_response(response.status)
                for key, value in response.getheaders():
                    if key.lower() not in ('connection', 'transfer-encoding', 'content-length', 'server', 'date'):
                        self.send_header(key, value)
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            finally:
                conn.close()
        except (OSError, ValueError, http.client.HTTPException):
            self.send_error(502, 'Dashboard connection unavailable')

    do_GET = forward
    do_POST = forward


if __name__ == '__main__':
    state = json.loads(Path(os.environ['FRAME_RELAY_AUTH']).read_text())
    server = ThreadingHTTPServer(('192.168.50.111', 8788), Relay)
    server.digest = state['key_sha256']
    server.serve_forever()
