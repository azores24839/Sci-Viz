#!/usr/bin/env python3
"""Run the actual local launcher with isolated settings, images and demo credentials."""
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
from urllib.request import Request, urlopen
from urllib.error import URLError

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as work:
    folder = Path(work).resolve()
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0)); port = sock.getsockname()[1]
    config = folder / 'local.env'
    config.write_text(f'CASE_HUB_DATA_DIR={folder / "data"}\nPORT={port}\nHOST=127.0.0.1\nJWT_SECRET=isolated-local-smoke-only\nALLOW_PUBLIC_REGISTRATION=false\n')
    env = {**os.environ, 'CASE_HUB_LOCAL_CONFIG': str(config)}
    log = folder / 'server.log'
    with log.open('w') as output:
        process = subprocess.Popen(['node','scripts/profile.mjs','local','--demo'], cwd=root, env=env, stdout=output, stderr=output)
        try:
            base = f'http://127.0.0.1:{port}'
            for _ in range(120):
                if process.poll() is not None:
                    raise RuntimeError('Local demo stopped: ' + log.read_text())
                try:
                    with urlopen(base+'/api/health',timeout=1) as response:
                        if response.status == 200: break
                except (URLError,TimeoutError): time.sleep(.5)
            else: raise RuntimeError('Local demo startup timed out: '+log.read_text())
            def fetch(route):
                with urlopen(base+route) as response: return response.read()
            assert b'Sci-Viz' in fetch('/')
            for route in ['/uploads/originals/demo-0.png','/uploads/thumbnails/demo-0.jpg','/journal_covers/demo-2.png']:
                assert len(fetch(route)) > 100
            result = json.loads(fetch('/api/cases'))
            assert result['success'] is True
            request = Request(base+'/api/auth/login',data=json.dumps({'username':'demo','password':'demo-local-only'}).encode(),headers={'Content-Type':'application/json','Origin':base})
            with urlopen(request) as response:
                assert json.loads(response.read())['success'] is True
                cookie = response.headers['Set-Cookie'].split(';')[0]
            with urlopen(Request(base+'/api/auth/check',headers={'Cookie':cookie})) as response:
                assert json.loads(response.read())['success'] is True
            assert (folder/'data/prisma/dev.db').is_file()
            print('PASS: local settings select custom port/data folder, serve originals/thumbnails/covers and support real login')
        finally:
            process.terminate()
            try: process.wait(timeout=15)
            except subprocess.TimeoutExpired: process.kill(); process.wait()
