"""Install only the agent. Preview by default; never edit firewall, SSH, Docker or Nginx."""
import argparse
import json
import os
import pathlib
import pwd
import shutil
import subprocess

BASE = pathlib.Path(__file__).resolve().parent

def install(config_file, credentials_file, root=pathlib.Path('/'), apply=False):
    config = json.loads(pathlib.Path(config_file).read_text())
    port = config.get('port')
    if type(port) is not int or not 1 <= port <= 65535 or config.get('apply') is not False:
        raise ValueError('First installation requires a valid port and apply=false')
    if not str(config.get('control_url', '')).startswith('https://'):
        raise ValueError('Production control URL requires HTTPS')
    credentials = pathlib.Path(credentials_file)
    if not credentials.is_file() or credentials.stat().st_mode & 0o077:
        raise ValueError('Credentials must exist and be owner-only (chmod 600)')
    root = root.resolve()
    files = {
        'opt/port-allowlist/agent.py': (BASE / 'agent.py', 0o644),
        'etc/port-allowlist/config.json': (pathlib.Path(config_file), 0o640),
        'etc/port-allowlist/credentials.env': (credentials, 0o600),
        'etc/systemd/system/port-allowlist.service': (BASE / 'port-allowlist.service', 0o644),
    }
    if any((root / name).exists() for name in files):
        raise ValueError('Refusing to overwrite an existing installation; back it up and follow the upgrade guide')
    print(json.dumps({'mode': 'install' if apply else 'preview', 'tcp_port': port,
                      'files': list(files), 'starts_service': False, 'changes_cloud_rules': False}))
    if not apply:
        return
    if root == pathlib.Path('/'):
        if os.geteuid() != 0:
            raise PermissionError('Run the installation as root')
        try:
            user = pwd.getpwnam('port-allowlist')
        except KeyError:
            subprocess.run(['useradd', '--system', '--user-group', '--home-dir', '/var/lib/port-allowlist',
                            '--shell', '/usr/sbin/nologin', 'port-allowlist'], check=True)
            user = pwd.getpwnam('port-allowlist')
    else:
        user = None  # Staging directory for installer verification, no system changes.
    for name, (source, mode) in files.items():
        target = root / name
        target.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation prevents a concurrent install from overwriting files.
        fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
        with os.fdopen(fd, 'wb') as dest, source.open('rb') as src:
            shutil.copyfileobj(src, dest)
        target.chmod(mode)
        if user and name.endswith('config.json'):
            os.chown(target, 0, user.pw_gid)
    state = root / 'var/lib/port-allowlist'
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    if user:
        os.chown(state, user.pw_uid, user.pw_gid)
        subprocess.run(['systemctl', 'daemon-reload'], check=True)
    print('Installed in dry-run mode. The service has NOT been started.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--credentials', required=True)
    parser.add_argument('--install', action='store_true', help='Write files; still does not start the service')
    parser.add_argument('--root', type=pathlib.Path, default=pathlib.Path('/'), help='Staging root for tests')
    args = parser.parse_args()
    install(args.config, args.credentials, args.root, args.install)
