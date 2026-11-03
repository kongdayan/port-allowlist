import contextlib
import importlib.util
import io
import json
import os
import pathlib
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('installer', pathlib.Path(__file__).parents[1] / 'install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)

class InstallTests(unittest.TestCase):
    def test_preview_permissions_overwrite_and_start_guard(self):
        with tempfile.TemporaryDirectory() as temp:
            base = pathlib.Path(temp)
            config = base / 'config.json'
            config.write_text(json.dumps({'port': 9443, 'apply': False, 'control_url': 'https://access.example.com'}))
            credentials = base / 'agent.env'
            secret = os.urandom(32).hex()
            credentials.write_text('PROXY_ACCESS_AGENT_KEY=' + secret)
            credentials.chmod(0o600)
            root = base / 'staged'
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                installer.install(config, credentials, root)
                self.assertFalse(root.exists())
                installer.install(config, credentials, root, True)
            self.assertNotIn(secret, output.getvalue())
            copied = root / 'etc/port-allowlist/credentials.env'
            self.assertEqual(copied.stat().st_mode & 0o777, 0o600)
            self.assertEqual(copied.read_text(), credentials.read_text())
            with self.assertRaises(ValueError): installer.install(config, credentials, root, True)
            config.write_text(json.dumps({'port': 9443, 'apply': True}))
            with self.assertRaises(ValueError): installer.install(config, credentials, base / 'other', True)
