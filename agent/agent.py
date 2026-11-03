"""Single-port TCP allowlist reconciler. Runtime dependencies: Python stdlib only."""
import argparse
import base64
import collections
import datetime
import hashlib
import hmac
import ipaddress
import json
import os
import pathlib
import re
import signal
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

PREFIX = 'port-allowlist:v1:'
PORT = 10800


class SyncError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def opener():
    # Explicitly ignore unrelated shell proxy variables; retain TLS verification.
    return urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def read_json(response, limit=512000):
    raw = response.read(limit + 1)
    if len(raw) > limit:
        raise SyncError('response_too_large')
    return json.loads(raw)


def public_ip(value):
    if not isinstance(value, str) or '/' in value:
        raise SyncError('invalid_ipv4')
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        raise SyncError('invalid_ipv4') from None
    if ip.version != 4 or not ip.is_global or ip.is_multicast:
        raise SyncError('invalid_ipv4')
    return str(ip)


def target_rule(rule):
    return (rule.get('Direction') == 'ingress' and rule.get('IpProtocol', '').lower() == 'tcp'
            and rule.get('PortRange') == f'{PORT}/{PORT}' and rule.get('Policy', '').lower() == 'accept'
            and bool(rule.get('SourceCidrIp')) and not rule.get('DestCidrIp')
            and rule.get('SourcePortRange', '') in ['', '-1/-1', '1/65535'])


def rule_cidr(rule):
    try:
        return str(ipaddress.ip_network(rule.get('SourceCidrIp', ''), strict=False))
    except ValueError:
        raise SyncError('invalid_cloud_rule') from None


def owned(rule):
    cidr = rule_cidr(rule) if target_rule(rule) else ''
    return (target_rule(rule) and cidr.endswith('/32')
            and rule.get('Description') == PREFIX + hashlib.sha256(cidr.encode()).hexdigest()[:16]
            and bool(rule.get('SecurityGroupRuleId')))


def rule_reference(rule):
    if not target_rule(rule) or not rule.get('SecurityGroupRuleId'):
        raise SyncError('invalid_existing_rule')
    fields = {k:rule.get(k,'') for k in ['SecurityGroupRuleId','Priority','Description','SourcePortRange','NicType']}
    fields['cidr'] = rule_cidr(rule)
    return hashlib.sha256(json.dumps(fields,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def deletion_refs(snapshot):
    refs = snapshot.get('delete_legacy', [])
    if not isinstance(refs,list) or len(refs)>250 or any(not isinstance(v,str) or not re.fullmatch(r'[a-f0-9]{64}',v) for v in refs):
        raise SyncError('invalid_deletion_policy')
    return set(refs)


def inventory(rules):
    return ([r for r in rules if owned(r)], [r for r in rules if target_rule(r) and not owned(r)])


def desired_ips(snapshot, current=None):
    current = int(time.time()) if current is None else current
    if not isinstance(snapshot, dict) or snapshot.get('port') != PORT or not isinstance(snapshot.get('entries'), list):
        raise SyncError('invalid_policy')
    deletion_refs(snapshot)
    if len(snapshot['entries']) > 200:
        raise SyncError('policy_limit')
    desired = set()
    for entry in snapshot['entries']:
        if not isinstance(entry, dict):
            raise SyncError('invalid_policy_entry')
        ip = public_ip(entry.get('ip'))
        expiry = entry.get('expires_at')
        if not isinstance(expiry, int) or expiry > current + 367 * 86400:
            raise SyncError('invalid_expiry')
        if expiry > current:
            desired.add(ip + '/32')
    return desired


def covered(cidr, legacy):
    address = ipaddress.ip_network(cidr).network_address
    for rule in legacy:
        try:
            if address in ipaddress.ip_network(rule['SourceCidrIp'], strict=False):
                return True
        except ValueError:
            raise SyncError('invalid_cloud_rule') from None
    return False


class Alibaba:
    """RPC v1 signing over HTTPS POST. Credentials never appear in URL or logs."""
    def __init__(self, region, group, key_id=None, secret=None, security_token=None):
        if not re.fullmatch(r'[a-z0-9-]+', region) or not re.fullmatch(r'sg-[A-Za-z0-9]+', group):
            raise SyncError('invalid_local_target')
        self.region, self.group = region, group
        self.key_id = key_id or os.environ.get('ALIYUN_ACCESS_KEY_ID')
        self.secret = secret or os.environ.get('ALIYUN_ACCESS_KEY_SECRET')
        self.security_token = security_token or os.environ.get('ALIYUN_SECURITY_TOKEN')
        if not self.key_id or not self.secret:
            raise SyncError('missing_cloud_credentials')

    def call(self, action, params):
        if action not in ['DescribeSecurityGroupAttribute', 'AuthorizeSecurityGroup', 'RevokeSecurityGroup']:
            raise SyncError('operation_not_allowed')
        query = {'Action': action, 'Version': '2014-05-26', 'Format': 'JSON',
                 'RegionId': self.region, 'SecurityGroupId': self.group,
                 'AccessKeyId': self.key_id, 'SignatureMethod': 'HMAC-SHA1',
                 'SignatureVersion': '1.0', 'SignatureNonce': str(uuid.uuid4()),
                 'Timestamp': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), **params}
        if self.security_token:
            query['SecurityToken'] = self.security_token
        quote = lambda s: urllib.parse.quote(str(s), safe='~')
        canonical = '&'.join(quote(k) + '=' + quote(v) for k, v in sorted(query.items()))
        to_sign = 'POST&%2F&' + quote(canonical)
        query['Signature'] = base64.b64encode(hmac.new((self.secret + '&').encode(), to_sign.encode(), hashlib.sha1).digest()).decode()
        request = urllib.request.Request('https://ecs.' + self.region + '.aliyuncs.com/',
                                        data=urllib.parse.urlencode(query).encode(),
                                        headers={'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent':'PortAllowlistAgent/0.1'})
        try:
            with opener().open(request, timeout=15) as response:
                result = read_json(response)
        except urllib.error.HTTPError as error:
            try:
                result = read_json(error)
                code = result.get('Code', 'cloud_http_error')
            except Exception:
                code = 'cloud_http_error'
            raise SyncError(re.sub(r'[^A-Za-z0-9_.-]', '', str(code))[:80]) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise SyncError('cloud_transport_error') from None
        if result.get('Code'):
            raise SyncError(re.sub(r'[^A-Za-z0-9_.-]', '', str(result['Code']))[:80])
        return result

    def rules(self):
        all_rules, token = [], None
        for _ in range(10):
            params = {'Direction': 'ingress', 'MaxResults': 1000}
            if token:
                params['NextToken'] = token
            data = self.call('DescribeSecurityGroupAttribute', params)
            all_rules += data.get('Permissions', {}).get('Permission', [])
            token = data.get('NextToken')
            if not token:
                return all_rules
        raise SyncError('cloud_pagination_limit')

    def add(self, cidrs):
        for offset in range(0, len(cidrs), 50):
            params = {}
            for n, cidr in enumerate(cidrs[offset:offset + 50], 1):
                public_ip(cidr.removesuffix('/32'))
                values = {'IpProtocol': 'tcp', 'PortRange': f'{PORT}/{PORT}', 'SourceCidrIp': cidr,
                          'Policy': 'accept', 'Priority': 1, 'NicType': 'intranet',
                          'Description': PREFIX + hashlib.sha256(cidr.encode()).hexdigest()[:16]}
                params.update({'Permissions.' + str(n) + '.' + k: v for k, v in values.items()})
            self.call('AuthorizeSecurityGroup', params)

    def delete(self, rule):
        if not owned(rule):
            raise SyncError('refusing_unmanaged_rule')
        self.call('RevokeSecurityGroup', {'SecurityGroupRuleId.1': rule['SecurityGroupRuleId']})


    def delete_existing(self, rule, reference):
        if not target_rule(rule) or owned(rule) or rule_reference(rule) != reference:
            raise SyncError('refusing_unverified_existing_rule')
        self.call('RevokeSecurityGroup', {'SecurityGroupRuleId.1': rule['SecurityGroupRuleId']})


def reconcile(provider, snapshot, apply=False, current=None):
    desired = desired_ips(snapshot, current)
    rules = provider.rules()
    requested=deletion_refs(snapshot)
    managed, all_legacy = inventory(rules)
    legacy=[r for r in all_legacy if rule_reference(r) not in requested]
    wanted = {cidr for cidr in desired if not covered(cidr, legacy)}
    missing = sorted(wanted - {rule_cidr(r) for r in managed})
    would_delete_owned = sorted({rule_cidr(r) for r in managed if rule_cidr(r) not in wanted})
    would_delete_existing = sorted({rule_cidr(r) for r in all_legacy if rule_reference(r) in requested})
    if apply:
        # An add failure exits before ANY deletion: the old path is retained.
        if missing:
            provider.add(missing)
            rules = provider.rules()
            managed, all_legacy = inventory(rules)
            legacy=[r for r in all_legacy if rule_reference(r) not in requested]
            if not all(cidr in {rule_cidr(r) for r in managed} or covered(cidr, legacy) for cidr in desired):
                raise SyncError('new_rule_not_confirmed')
        for rule in managed:
            if rule_cidr(rule) not in wanted:
                provider.delete(rule)
        for rule in all_legacy:
            reference=rule_reference(rule)
            if reference in requested:
                provider.delete_existing(rule,reference)
        managed, legacy = inventory(provider.rules())
    else:
        legacy=all_legacy
    return {'managed': sorted({rule_cidr(r) for r in managed}),
            'legacy': sorted({rule_cidr(r) for r in legacy}),
            'legacy_rules': [{'ref':rule_reference(r),'cidr':rule_cidr(r)} for r in legacy],
            'would_add': missing, 'would_delete_owned': would_delete_owned,
            'would_delete_existing': would_delete_existing, 'mode': 'apply' if apply else 'dry-run'}


class Telemetry:
    def __init__(self, path, state):
        self.path, self.state = pathlib.Path(path), state

    def sessions(self):
        queue = self.state.setdefault('pending_events', [])
        try:
            st = self.path.stat()
            cursor = self.state.get('log_cursor', {})
            offset = cursor.get('offset', 0) if cursor.get('inode') == st.st_ino else 0
            if offset > st.st_size:
                offset = 0
            with self.path.open('rb') as f:
                f.seek(offset)
                for _ in range(500):
                    start = f.tell(); line = f.readline(16385)
                    if not line or not line.endswith(b'\n'):
                        f.seek(start)
                        break
                    try:
                        data = json.loads(line)
                        ip = public_ip(data['ip'])
                        at = int(datetime.datetime.fromisoformat(data['ts']).timestamp())
                        queue.append({'id': hashlib.sha256(str(st.st_ino).encode() + str(start).encode() + line).hexdigest(),
                                      'ip': ip, 'at': at, 'bytes_up': int(data['bytes_up']), 'bytes_down': int(data['bytes_down']),
                                      'duration': float(data['duration']), 'status': str(data['status'])})
                    except (ValueError, KeyError, SyncError):
                        pass
                self.state['log_cursor'] = {'inode': st.st_ino, 'offset': f.tell()}
            self.state['pending_events'] = queue[-2000:]
        except FileNotFoundError:
            pass
        return self.state['pending_events'][:20]

    def sample(self, raw=None, current=None):
        current = int(time.time()) if current is None else current
        if raw is None:
            result = subprocess.run(['ss', '-Htin', 'state', 'established', 'sport', '=', f':{PORT}'],
                                    text=True, capture_output=True, timeout=5)
            if result.returncode:
                raise SyncError('tcp_sampling_failed')
            raw = result.stdout
        previous = self.state.get('tcp_cursor', {})
        elapsed = current - self.state.get('tcp_at', 0)
        available = 0 < elapsed <= 60
        counters, peers, traffic = {}, collections.Counter(), {}
        socket_key = None; ip = None; limited = False
        for line in raw.splitlines():
            if line and not line[0].isspace():
                socket_key, ip = None, None
                try:
                    fields = line.split()
                    address = fields[-1].rsplit(':', 1)[0].strip('[]')
                    ip = public_ip(address)
                    peers[ip] += 1
                    if len(counters) >= 2000:
                        limited = True; ip = None; continue
                    socket_key = '|'.join(fields[-2:])
                    counters[socket_key] = {'up': 0, 'down': 0}
                except (IndexError, SyncError):
                    pass
            elif socket_key and ip:
                values = dict(re.findall(r'(bytes_sent|bytes_received):(\d+)', line))
                up, down = int(values.get('bytes_received', 0)), int(values.get('bytes_sent', 0))
                counters[socket_key] = {'up': up, 'down': down}
                old = previous.get(socket_key, {'up': 0, 'down': 0}) if available else counters[socket_key]
                rate = traffic.setdefault(ip, {'up_bps': 0, 'down_bps': 0})
                rate['up_bps'] += max(0, up-old['up']) / elapsed if available else 0
                rate['down_bps'] += max(0, down-old['down']) / elapsed if available else 0
        self.state['tcp_cursor'], self.state['tcp_at'] = counters, current
        return {'active': dict(peers.most_common(200)), 'traffic': traffic,
                'traffic_available': available, 'traffic_limited': limited, 'traffic_interval': elapsed if available else 0}


class Agent:
    def __init__(self, config):
        self.config = config
        self.base = config['control_url'].rstrip('/')
        parsed = urllib.parse.urlparse(self.base)
        if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise SyncError('control_requires_https')
        self.key = os.environ.get('PROXY_ACCESS_AGENT_KEY')
        if not self.key:
            raise SyncError('missing_agent_key')
        self.provider = Alibaba(config['region'], config['security_group_id'])
        self.path = pathlib.Path(config.get('state_file', '/var/lib/port-allowlist/state.json'))
        self.state = json.loads(self.path.read_text()) if self.path.exists() else {}
        self.telemetry = Telemetry(config.get('log_file', '/var/log/port-allowlist/sessions.log'), self.state)
        self.last_check = 0
        self.last_inventory_sent = 0
        self.sent_inventory_digest = None
        self.result = self.state.get('inventory', {'managed': [], 'legacy': [], 'mode': 'dry-run'})

    def control(self, path, data=None):
        raw = json.dumps(data).encode() if data is not None else None
        request = urllib.request.Request(self.base + path, data=raw, headers={
            'Authorization': 'Bearer ' + self.key, 'Content-Type': 'application/json', 'User-Agent': 'PortAllowlistAgent/0.1'})
        try:
            with opener().open(request, timeout=15) as r:
                return read_json(r)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError):
            raise SyncError('control_unavailable') from None

    def save(self):
        self.path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        tmp = self.path.with_suffix('.tmp')
        tmp.write_text(json.dumps(self.state)); tmp.chmod(0o600); tmp.replace(self.path)

    def tick(self):
        current = int(time.time()); error = None
        try:
            snapshot = self.control('/api/agent/desired')
            if abs(snapshot.get('issued_at', 0) - current) > 120:
                raise SyncError('policy_clock_error')
            desired_ips(snapshot, current)
            self.state['snapshot'] = snapshot
        except SyncError as e:
            error = str(e)
            snapshot = self.state.get('snapshot')
        if snapshot is not None:
            # A cached policy retains each lease's original expiry, never an indefinite allow.
            effective = sorted(desired_ips(snapshot, current))
            digest = hashlib.sha256(json.dumps({'ips':effective,'delete':sorted(deletion_refs(snapshot))},sort_keys=True).encode()).hexdigest()
            if digest != self.state.get('effective_digest') or current - self.last_check >= 60:
                try:
                    self.result = reconcile(self.provider, snapshot, bool(self.config.get('apply')), current)
                    self.state['inventory'] = self.result
                    self.state['effective_digest'] = digest
                    self.last_check = current
                except SyncError as e:
                    error = str(e)
        events = self.telemetry.sessions()
        report = {k: self.result.get(k, []) for k in ['managed', 'legacy']}
        try:
            sample = self.telemetry.sample()
        except (SyncError, subprocess.TimeoutExpired, OSError):
            sample = {'active': {}, 'traffic': {}, 'traffic_available': False}; error = error or 'tcp_sampling_failed'
        inventory_digest=hashlib.sha256(json.dumps(self.result.get('legacy_rules',[]),sort_keys=True).encode()).hexdigest()
        send_inventory='legacy_rules' in self.result and (inventory_digest!=self.sent_inventory_digest or current-self.last_inventory_sent>=300)
        if send_inventory:
            report['existing_rules']=self.result['legacy_rules']
        report.update(sample)
        report.update({'mode': 'apply' if self.config.get('apply') else 'dry-run',
                       'error': error, 'events': events, 'last_apply': self.last_check})
        try:
            self.control('/api/agent/report', report)
            if send_inventory:
                self.last_inventory_sent=current; self.sent_inventory_digest=inventory_digest
            if events:
                del self.state['pending_events'][:len(events)]
        except SyncError:
            error = error or 'report_unavailable'
        self.last_error = error
        self.save()
        print(json.dumps({'event': 'sync', 'mode': report['mode'], 'managed_count': len(report['managed']),
                          'protected_count': len(report['legacy']), 'error': error}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', default='/etc/port-allowlist/config.json')
    parser.add_argument('--env-file', help='Optional owner-only KEY=VALUE file, never executed')
    parser.add_argument('--check-cloud', action='store_true')
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--plan-file', help='Write an owner-only dry-run proposal; requires --once and apply=false')
    args = parser.parse_args()
    if args.env_file:
        path = pathlib.Path(args.env_file)
        if path.stat().st_mode & 0o077:
            raise SyncError('credential_file_must_be_owner_only')
        for line in path.read_text().splitlines():
            if not line.strip() or line.startswith('#'):
                continue
            key, sep, value = line.partition('=')
            if not sep or key not in {'PROXY_ACCESS_AGENT_KEY', 'ALIYUN_ACCESS_KEY_ID', 'ALIYUN_ACCESS_KEY_SECRET', 'ALIYUN_SECURITY_TOKEN'} or not value or any(c.isspace() for c in value):
                raise SyncError('invalid_credential_file')
            os.environ[key] = value
    config = json.loads(pathlib.Path(args.config).read_text())
    global PORT
    value = config.get('port', 10800)
    if type(value) is not int or not 1 <= value <= 65535:
        raise SyncError('invalid_tcp_port')
    PORT = value
    if type(config.get('apply', False)) is not bool:
        raise SyncError('apply_must_be_boolean')
    if args.plan_file and (not args.once or config.get('apply') is not False):
        raise SyncError('plan_requires_once_and_dry_run')
    if args.check_cloud:
        rules = Alibaba(config['region'], config['security_group_id']).rules()
        managed, legacy = inventory(rules)
        print(json.dumps({'cloud_authenticated': True, 'managed_count': len(managed), 'protected_count': len(legacy)}))
        return
    agent = Agent(config)
    while True:
        try:
            agent.tick()
        except Exception as e:
            print(json.dumps({'event': 'agent_error', 'type': type(e).__name__}), flush=True)
            if args.once:
                raise SyncError('agent_tick_failed') from None
        if args.once:
            if args.plan_file:
                plan = {'port': PORT, 'error': getattr(agent, 'last_error', None), **agent.result}
                fd = os.open(args.plan_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, 'w') as output:
                    json.dump(plan, output, indent=2)
            if getattr(agent, 'last_error', None):
                raise SyncError(agent.last_error)
            break
        time.sleep(max(5, int(config.get('poll_seconds', 10))))


if __name__ == '__main__':
    main()
