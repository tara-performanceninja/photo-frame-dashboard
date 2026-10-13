"""Small read-only collectors. Return allowlisted display data, never raw credentials."""
from datetime import datetime, timezone, timedelta
import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import sys
import time
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

WORKSPACE = Path('/home/adminrichwebb/.openclaw/workspace')
CODEX_HOME = Path('/home/adminrichwebb/.openclaw/agents/main/agent/codex-home')
sys.path.insert(0, str(WORKSPACE / 'scripts'))
from run_with_env import load_env, DEFAULT_ENV_FILE


def now():
    return datetime.now(timezone.utc).isoformat()


def read_json(path, default=None):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return default


def linear_query(query, variables):
    token = load_env(DEFAULT_ENV_FILE).get('LINEAR_API_KEY')
    if not token:
        raise RuntimeError('Linear not connected')
    req = Request('https://api.linear.app/graphql', data=json.dumps({'query': query, 'variables': variables}).encode(),
                  headers={'Authorization': token, 'Content-Type': 'application/json'})
    with urlopen(req, timeout=20) as response:
        result = json.load(response)
    if result.get('errors'):
        raise RuntimeError('Linear query unavailable')
    return result['data']


def fetch_linear():
    users = linear_query('query($filter:UserFilter){users(first:10,filter:$filter){nodes{id name}}}',
                         {'filter': {'email': {'eqIgnoreCase': 'rich@ciriongroup.com'}}})['users']['nodes']
    if len(users) != 1:
        raise RuntimeError('Rich assignment unavailable')
    query = '''query($filter:IssueFilter,$after:String){issues(first:100,filter:$filter,after:$after,orderBy:updatedAt){
      nodes{identifier title priority url dueDate updatedAt state{name type} team{name key} project{name}}
      pageInfo{hasNextPage endCursor}}}'''
    variables = {'filter': {'assignee': {'id': {'eq': users[0]['id']}},
                           'state': {'type': {'nin': ['completed', 'canceled']}}}, 'after': None}
    items = []
    for _ in range(5):
        page = linear_query(query, variables)['issues']
        items.extend(page['nodes'])
        if not page['pageInfo']['hasNextPage']:
            break
        variables['after'] = page['pageInfo']['endCursor']
    else:
        raise RuntimeError('Linear pagination incomplete')
    today = datetime.now(ZoneInfo('Europe/London')).date().isoformat()
    items.sort(key=lambda row: (not bool(row.get('dueDate') and row['dueDate'] < today),
                               row['state']['type'] != 'started', row.get('priority') or 99,
                               row.get('dueDate') or '9999', row['identifier']))
    return {'status': 'ok', 'updatedAt': now(), 'assignee': 'Rich', 'items': items}


def codex_executable():
    # Discover the currently managed binary rather than pinning a generation path.
    for proc in Path('/proc').iterdir():
        if not proc.name.isdigit():
            continue
        try:
            exe = (proc / 'exe').resolve()
            if exe.name == 'codex' and '.openclaw' in str(exe):
                return str(exe)
        except OSError:
            pass
    candidates = list(Path('/home/adminrichwebb/.openclaw/npm').glob('projects/*/node_modules/@openai/codex-linux-arm64/vendor/*/bin/codex'))
    if not candidates:
        raise RuntimeError('Codex reader unavailable')
    return str(candidates[-1])


def codex_read():
    proc = subprocess.Popen([codex_executable(), 'app-server'], stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                            env=dict(os.environ, CODEX_HOME=str(CODEX_HOME)), bufsize=0)
    buffer = b''
    selector = selectors.DefaultSelector()
    selector.register(proc.stdout, selectors.EVENT_READ)
    def request(ident, method, params):
        nonlocal buffer
        proc.stdin.write((json.dumps({'id': ident, 'method': method, 'params': params}) + '\n').encode())
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            while b'\n' in buffer:
                line, buffer = buffer.split(b'\n', 1)
                result = json.loads(line)
                if result.get('id') == ident:
                    if 'error' in result:
                        raise RuntimeError('Codex usage unavailable')
                    return result['result']
            if selector.select(0.5):
                chunk = os.read(proc.stdout.fileno(), 65536)
                if not chunk:
                    break
                buffer += chunk
                if len(buffer) > 2_000_000:
                    raise RuntimeError('Usage response too large')
        raise RuntimeError('Codex usage timeout')
    try:
        request(1, 'initialize', {'clientInfo': {'name': 'frame-usage-reader', 'version': '1.0'}})
        proc.stdin.write(b'{"method":"initialized"}\n')
        limits = request(2, 'account/rateLimits/read', {})
        try:
            usage = request(3, 'account/usage/read', {})
        except RuntimeError:
            usage = {}
        return limits, usage
    finally:
        selector.close()
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait()
        proc.stdin.close()
        proc.stdout.close()


def normalise_usage(limits, usage):
    windows = []
    groups = limits.get('rateLimitsByLimitId') or {'codex': limits.get('rateLimits', {})}
    for key, group in groups.items():
        for window in ('primary', 'secondary'):
            value = group.get(window)
            if not value or value.get('usedPercent') is None:
                continue
            used = max(0, min(100, float(value['usedPercent'])))
            windows.append({'name': group.get('limitName') or key,
                            'minutes': value.get('windowDurationMins'), 'usedPercent': used,
                            'remainingPercent': 100 - used,
                            'resetsAt': datetime.fromtimestamp(value['resetsAt'], timezone.utc).isoformat() if value.get('resetsAt') else None})
    buckets = usage.get('dailyUsageBuckets') or []
    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=6)).isoformat()
    recent = [row for row in buckets if row.get('startDate', '') >= cutoff]
    plan = (limits.get('rateLimits') or {}).get('planType')
    return {'status': 'ok' if windows else 'unavailable', 'updatedAt': now(), 'plan': plan,
            'windows': windows, 'dailyTokens': recent, 'weekTokens': sum(row.get('tokens', 0) for row in recent),
            'usageAvailable': bool(buckets), 'resetCredits': (limits.get('rateLimitResetCredits') or {}).get('availableCount')}


def fetch_usage():
    limits, usage = codex_read()
    return normalise_usage(limits, usage)


def command(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=3)
        return result.stdout.strip() if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def fetch_tara():
    mem = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key, value = line.split(':', 1)
        mem[key] = int(value.strip().split()[0]) * 1024
    disk = shutil.disk_usage(WORKSPACE)
    try:
        temperature = float(Path('/sys/class/thermal/thermal_zone0/temp').read_text()) / 1000
    except (OSError, ValueError):
        temperature = None
    raw = command(['/usr/bin/vcgencmd', 'get_throttled'])
    throttled = int(raw.split('=')[-1], 16) if raw else None
    services = {name: command(['systemctl', '--user', 'is-active', unit]) or 'unavailable'
                for name, unit in [('OpenClaw', 'openclaw-gateway.service'), ('Dashboard', 'photo-frame-dashboard.service')]}
    # is-active prints 'inactive' with non-zero exit, so keep that distinct from a healthy state.
    tasks = (read_json(WORKSPACE / 'memory/tasks.json', {}) or {}).get('tasks', [])
    def public_task(row):
        return {key: row.get(key) for key in ('id', 'title', 'status', 'workstream', 'updated', 'next_action')}
    active = sorted([public_task(row) for row in tasks if row.get('status') in ('next', 'inbox')],
                    key=lambda row: str(row.get('updated') or ''), reverse=True)
    needs = [public_task(row) for row in tasks if row.get('status') in ('waiting', 'blocked')]
    completed = sorted([public_task(row) for row in tasks if row.get('status') == 'done'],
                       key=lambda row: str(row.get('updated') or ''), reverse=True)[:8]
    alerts = []
    if temperature is None: alerts.append('Temperature sensor unavailable')
    elif temperature >= 75: alerts.append('High temperature')
    if mem['MemAvailable'] / mem['MemTotal'] < .1: alerts.append('Memory running low')
    if disk.free / disk.total < .15: alerts.append('Storage running low')
    if throttled is None: alerts.append('Throttle status unavailable')
    elif throttled & 0xf: alerts.append('Throttling or low voltage detected')
    if os.getloadavg()[0] > os.cpu_count(): alerts.append('System load above CPU capacity')
    if services['OpenClaw'] != 'active': alerts.append('OpenClaw service not confirmed active')
    return {'status': 'ok', 'updatedAt': now(), 'alerts': alerts,
            'health': {'temperature': temperature, 'throttleMask': throttled,
                       'memoryTotal': mem['MemTotal'], 'memoryAvailable': mem['MemAvailable'],
                       'swapTotal': mem['SwapTotal'], 'swapUsed': mem['SwapTotal'] - mem['SwapFree'],
                       'diskTotal': disk.total, 'diskFree': disk.free, 'load': list(os.getloadavg()),
                       'cpuCount': os.cpu_count(), 'uptimeSeconds': float(Path('/proc/uptime').read_text().split()[0]),
                       'services': services},
            'tasks': active, 'needsAttention': needs, 'completed': completed}
