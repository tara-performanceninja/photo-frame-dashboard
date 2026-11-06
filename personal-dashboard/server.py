#!/usr/bin/env python3
"""Private, read-only LAN dashboard. No third-party credentials reach the browser."""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import ipaddress
import json
import os
import re
from pathlib import Path
import secrets
import subprocess
import sys
import threading
import time
from urllib.parse import parse_qs, urlsplit
from urllib.request import urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from operations import fetch_linear, fetch_usage, fetch_tara

MARKET_REPORTS = Path(os.environ.get('FRAME_MARKET_REPORTS', str(ROOT.parents[2] / 'out/downloads/market-intelligence')))
STATE = ROOT / '.state'
TZ = ZoneInfo('Europe/London')
GWS = '/home/adminrichwebb/.npm-global/bin/gws'
CALENDARS = [('richwebb13@gmail.com','Personal'),('rich.webb@teamtri.com','TEAMTRI'),('rich@militarysherpa.com','Military Sherpa'),('rich@ciriongroup.com','Cirion Group')]
WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=51.5074&longitude=-0.1278&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&wind_speed_unit=mph&timezone=Europe%2FLondon&forecast_days=4'


def iso_now():
    return datetime.now(timezone.utc).isoformat()


def atomic_json(path, data):
    temp = path.with_suffix('.tmp')
    with temp.open('w',encoding='utf-8') as f:
        os.chmod(temp,0o600)
        json.dump(data,f)
    temp.replace(path)


def calendar_key(event):
    start=event.get('start',{})
    return (event.get('iCalUID') or event.get('id') or event.get('summary'), start.get('dateTime') or start.get('date'))


def normalise_events(pairs):
    seen=set(); rows=[]
    for label, event in pairs:
        if event.get('status')=='cancelled': continue
        if any(a.get('self') and a.get('responseStatus')=='declined' for a in event.get('attendees',[])): continue
        start=event.get('start',{}); end=event.get('end',{})
        if not (start.get('dateTime') or start.get('date')): continue
        key=calendar_key(event)
        if key in seen: continue
        seen.add(key)
        rows.append({'id':event.get('id',''),'title':event.get('summary') or 'Untitled appointment','start':start.get('dateTime') or start.get('date'),'end':end.get('dateTime') or end.get('date') or start.get('dateTime') or start.get('date'),'allDay':'date' in start,'location':event.get('location',''),'calendar':label})
    return sorted(rows,key=lambda r:r['start'])


def read_calendar(calendar):
    cal_id,label=calendar
    today=datetime.now(TZ).replace(hour=0,minute=0,second=0,microsecond=0)
    params={'calendarId':cal_id,'timeMin':today.isoformat(),'timeMax':(today+timedelta(days=7)).isoformat(),'singleEvents':True,'orderBy':'startTime','maxResults':250}
    rows=[]
    for _ in range(4):
        env=dict(os.environ); env.setdefault('GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND','file')
        result=subprocess.run([GWS,'calendar','events','list','--params',json.dumps(params),'--format','json'],capture_output=True,text=True,timeout=25,env=env)
        if result.returncode: raise RuntimeError('Calendar unavailable')
        obj=json.loads(result.stdout)
        if 'error' in obj: raise RuntimeError('Calendar unavailable')
        rows.extend((label,event) for event in obj.get('items',[]))
        if not obj.get('nextPageToken'): return rows
        params['pageToken']=obj['nextPageToken']
    raise RuntimeError('Calendar pagination limit')


def fetch_calendars():
    rows=[]; successes=0
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures=[pool.submit(read_calendar,c) for c in CALENDARS]
        for future in futures:
            try: rows.extend(future.result()); successes+=1
            except Exception: pass
    if not successes: raise RuntimeError('Calendar unavailable')
    return {'status':'ok' if successes==len(CALENDARS) else 'partial','updatedAt':iso_now(),'items':normalise_events(rows),'sourcesConnected':successes,'sourcesTotal':len(CALENDARS)}


def weather_description(code):
    if code==0:return 'Clear skies'
    if code in (1,2):return 'Partly cloudy'
    if code==3:return 'Overcast'
    if code in (45,48):return 'Foggy'
    if code in (51,53,55,56,57):return 'Drizzle'
    if code in (61,63,65,66,67,80,81,82):return 'Rain'
    if code in (71,73,75,77,85,86):return 'Snow'
    if code in (95,96,99):return 'Thunderstorms'
    return 'Local weather'


def fetch_weather():
    with urlopen(WEATHER_URL,timeout=20) as response: obj=json.load(response)
    c=obj['current']; d=obj['daily']
    return {'status':'ok','updatedAt':iso_now(),'location':'London','current':{'temperature':c['temperature_2m'],'feelsLike':c['apparent_temperature'],'windMph':c['wind_speed_10m'],'code':c['weather_code'],'description':weather_description(c['weather_code'])},'daily':[{'date':date,'high':d['temperature_2m_max'][i],'low':d['temperature_2m_min'][i],'rainChance':d['precipitation_probability_max'][i]} for i,date in enumerate(d['time'])]}


class Sources:
    def __init__(self):
        self.lock=threading.Lock();self.health_at=0;self.data={'calendar':{'status':'error','items':[]},'weather':{'status':'error'},'reminders':{'status':'error','items':[]},'generatedAt':iso_now()}
        try:self.data.update(json.loads((STATE/'cache.json').read_text()))
        except (OSError,ValueError):pass

    def refresh(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures={'calendar':pool.submit(fetch_calendars),'weather':pool.submit(fetch_weather),'linear':pool.submit(fetch_linear),'usage':pool.submit(fetch_usage)}
            for key,future in futures.items():
                try:result=future.result()
                except Exception:
                    result=dict(self.data.get(key,{}));result['status']='error'
                with self.lock:self.data[key]=result
        try:
            reminders=json.loads((STATE/'reminders.json').read_text())
            if not isinstance(reminders.get('items'),list):raise ValueError()
        except (OSError,ValueError):reminders={'status':'error','items':[]}
        with self.lock:
            self.data['reminders']=reminders;self.data['generatedAt']=iso_now()
            atomic_json(STATE/'cache.json',self.data)

    def snapshot(self):
        with self.lock:return json.dumps(self.data).encode()

    def operations(self):
        with self.lock:
            if time.monotonic()-self.health_at > 30:
                try:self.data['tara']=fetch_tara();self.health_at=time.monotonic()
                except Exception:
                    previous=dict(self.data.get('tara',{}));previous['status']='error';self.data['tara']=previous
            return json.dumps({key:self.data.get(key,{'status':'error'}) for key in ('linear','usage','tara')}).encode()

    def loop(self):
        try:self.refresh()
        except Exception:pass
        while True:
            time.sleep(300)
            try:self.refresh()
            except Exception:pass


class Handler(BaseHTTPRequestHandler):
    server_version='FrameDashboard'
    def log_message(self,*args):pass # Do not log token URLs or personal data.
    def send(self,status,body=b'',kind='text/plain; charset=utf-8',headers=None):
        self.send_response(status)
        self.send_header('Content-Type',kind)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','private, no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('X-Robots-Tag','noindex, nofollow')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',headers.pop('Content-Security-Policy') if headers and 'Content-Security-Policy' in headers else "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'")
        for k,v in (headers or {}).items():self.send_header(k,v)
        self.end_headers();self.wfile.write(body)

    def authorised(self):
        addr=ipaddress.ip_address(self.client_address[0])
        allowed=addr.is_loopback or addr in ipaddress.ip_network('192.168.50.0/24') or addr in ipaddress.ip_network('100.64.0.0/10')
        host=(self.headers.get('Host') or '').split(':')[0]
        if not allowed or host not in self.server.allowed_hosts:
            self.send(403,b'Not available');return False
        cookies=SimpleCookie()
        try:cookies.load(self.headers.get('Cookie',''))
        except Exception:self.send(403,b'Private dashboard');return False
        cookie=cookies.get('frame_session')
        # Tailscale Serve strips client-supplied identity headers. Trust them only
        # from the loopback proxy, for the named tailnet owner and exact HTTPS host.
        tail_owner=bool(self.server.tail_owner) and addr.is_loopback and host==self.server.tail_host and self.headers.get('Tailscale-User-Login')==self.server.tail_owner
        if not tail_owner and (not cookie or not secrets.compare_digest(cookie.value,self.server.access_key)):
            self.send(403,b'Private dashboard. Open the private launch link on this device.');return False
        return True

    def do_GET(self):
        url=urlsplit(self.path);query=parse_qs(url.query)
        if 'key' in query:
            addr=ipaddress.ip_address(self.client_address[0]);host=(self.headers.get('Host') or '').split(':')[0]
            if host not in self.server.allowed_hosts or not (addr.is_loopback or addr in ipaddress.ip_network('192.168.50.0/24') or addr in ipaddress.ip_network('100.64.0.0/10')):return self.send(403,b'Not available')
            if not secrets.compare_digest(query['key'][0],self.server.access_key):return self.send(403,b'Access not recognised')
            dest='/?rail=1' if 'rail' in query else '/?content=1' if 'content' in query else '/'
            return self.send(303,headers={'Location':dest,'Set-Cookie':'frame_session='+self.server.access_key+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000'})
        if not self.authorised():return
        if url.path=='/api/operations':return self.send(200,self.server.sources.operations(),'application/json')
        if url.path=='/api/navigation':
            with self.server.nav_lock:body=json.dumps(self.server.navigation).encode()
            return self.send(200,body,'application/json')
        if url.path=='/api/today':return self.send(200,self.server.sources.snapshot(),'application/json')
        if url.path.startswith('/market/'):
            name=url.path[len('/market/'):]
            if not re.fullmatch(r'(?:latest|index|\d{4}-\d{2}-\d{2})\.html',name):return self.send(404,b'Not found')
            try:body=(MARKET_REPORTS/name).read_bytes()
            except OSError:return self.send(503,b'Market report unavailable. Please try again shortly.')
            return self.send(200,body,'text/html; charset=utf-8',{'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"})
        if url.path=='/':path=ROOT/'index.html'
        elif url.path in ('/style.css','/request.js','/app.js','/operations.js','/assets/brand-icon.png','/assets/brand-logo.png','/assets/Montserrat.ttf'):path=ROOT/url.path[1:]
        else:return self.send(404,b'Not found')
        kinds={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.ttf':'font/ttf'}
        try:body=path.read_bytes()
        except OSError:return self.send(404,b'Not found')
        self.send(200,body,kinds[path.suffix])

    def do_POST(self):
        if not self.authorised():return
        if urlsplit(self.path).path != '/api/navigation':return self.send(405,b'Read-only data')
        # Browser-only, same-origin navigation. No writes to third-party services.
        origin=urlsplit(self.headers.get('Origin',''))
        if origin.netloc != self.headers.get('Host') or origin.scheme not in ('http','https'):
            return self.send(403,b'Same-origin navigation required')
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0 < size <= 256:raise ValueError()
            tab=json.loads(self.rfile.read(size)).get('tab')
            if tab not in ('today','teamtri','usage','linear','tara','market'):raise ValueError()
        except (ValueError,AttributeError):return self.send(400,b'Unknown tab')
        with self.server.nav_lock:
            self.server.navigation={'tab':tab,'revision':self.server.navigation['revision']+1}
            body=json.dumps(self.server.navigation).encode()
        self.send(200,body,'application/json')


def main():
    p=argparse.ArgumentParser();p.add_argument('--bind',default='127.0.0.1');p.add_argument('--port',type=int,default=8788);args=p.parse_args()
    STATE.mkdir(exist_ok=True,mode=0o700)
    config=STATE/'access.json'
    if not config.exists():atomic_json(config,{'key':secrets.token_urlsafe(32)})
    settings=json.loads(config.read_text())
    if not settings.get('tailOwner'):
        try:
            tail=json.loads(subprocess.check_output(['tailscale','status','--json'],text=True,timeout=5))
            own=tail.get('Self',{});owner=tail.get('User',{}).get(str(own.get('UserID')),{})
            settings['tailOwner']=owner.get('LoginName');settings['tailHost']=(own.get('DNSName') or '').rstrip('.')
            atomic_json(config,settings)
        except Exception:pass
    key=settings['key']
    sources=Sources();threading.Thread(target=sources.loop,daemon=True).start()
    server=ThreadingHTTPServer((args.bind,args.port),Handler)
    server.access_key=key;server.sources=sources
    server.nav_lock=threading.Lock();server.navigation={'tab':'today','revision':int(time.time()*1000)}
    server.tail_host=settings.get('tailHost');server.tail_owner=settings.get('tailOwner')
    server.allowed_hosts={'127.0.0.1','localhost','192.168.50.111','192.168.50.103','100.91.58.81','tara.local'}
    if server.tail_host:server.allowed_hosts.add(server.tail_host)
    print('Private dashboard listening on port '+str(args.port),flush=True)
    server.serve_forever()

if __name__=='__main__':main()
