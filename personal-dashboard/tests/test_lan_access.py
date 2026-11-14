import importlib.util
from pathlib import Path
import json
import secrets
import sys
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
sys.path.insert(0,str(Path(__file__).parents[1]))
spec=importlib.util.spec_from_file_location('lan_server',Path(__file__).parents[1]/'server.py')
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)

class LanAccessTests(unittest.TestCase):
    def setUp(self):
        self.server=ThreadingHTTPServer(('127.0.0.1',0),s.Handler)
        self.server.access_key=secrets.token_urlsafe(32)
        self.server.allowed_hosts={'192.168.50.241'}
        self.server.tail_owner='';self.server.tail_host=''
        self.server.nav_lock=threading.Lock();self.server.navigation={'tab':'today','revision':1}
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join()
    def request(self,host='192.168.50.241:8788',cookie=True,origin=None):
        headers={'Host':host}
        if cookie:headers['Cookie']='frame_session='+self.server.access_key
        if origin:headers.update(Origin=origin,**{'Content-Type':'application/json'})
        connection=HTTPConnection('127.0.0.1',self.server.server_port)
        connection.request('POST' if origin else 'GET','/api/navigation' if origin else '/',body=b'{"tab":"market"}' if origin else None,headers=headers)
        response=connection.getresponse();status=response.status;response.read();connection.close();return status
    def test_direct_lan_requires_original_cookie(self):
        self.assertEqual(self.request(),200)
        self.assertEqual(self.request(cookie=False),403)
    def test_unknown_host_rejected_even_with_cookie(self):
        self.assertEqual(self.request(host='attacker.invalid'),403)
    def test_navigation_retains_origin_guard(self):
        self.assertEqual(self.request(origin='http://attacker.invalid'),403)
        self.assertEqual(self.request(origin='http://192.168.50.241:8788'),200)
        self.assertEqual(self.server.navigation['tab'],'market')

if __name__=='__main__':unittest.main()
