#!/usr/bin/env python3
"""Validate private online settings without printing secrets or executing file content."""
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit


def validate(file):
    values = {}
    for line in Path(file).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, sep, value = line.partition('=')
        if not sep:
            raise ValueError('Settings must use KEY=value lines')
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in '\"\'':
            value = value[1:-1]
        else:
            value = value.split('#', 1)[0].strip()
        values[key.strip()] = value
    if not re.fullmatch(r'[a-f0-9]{40}', values.get('CASE_HUB_IMAGE_TAG', '')):
        raise ValueError('CASE_HUB_IMAGE_TAG must be the tested full 40-character Git SHA')
    if not Path(values.get('CASE_HUB_DATA_DIR', '')).is_absolute():
        raise ValueError('CASE_HUB_DATA_DIR must be an absolute server data directory')
    for key in ('JWT_SECRET', 'STUDIO_SERVICE_KEY'):
        value = values.get(key, '')
        if len(value) < 32 or re.search(r'change-me|replace-with|local-demo', value, re.I):
            raise ValueError(f'{key} requires a real production secret of at least 32 characters')
    if values['JWT_SECRET'] == values['STUDIO_SERVICE_KEY']:
        raise ValueError('Use different JWT_SECRET and STUDIO_SERVICE_KEY values')
    origins = values.get('CORS_ORIGINS', '').split(',')
    for origin in origins:
        origin = origin.strip()
        url = urlsplit(origin)
        if url.scheme != 'https' or not url.netloc or url.username or url.password or url.path or url.query or url.fragment or '*' in origin or 'example.edu.cn' in origin:
            raise ValueError('CORS_ORIGINS requires actual HTTPS origins without a path')
    if values.get('CASE_HUB_ALLOW_DATABASE_INITIALIZATION', 'false') != 'false':
        raise ValueError('Existing-library deployment must not initialize a new database')
    return values


if __name__ == '__main__':
    try:
        values = validate(sys.argv[1])
    except (ValueError, OSError, IndexError) as error:
        sys.exit(f'线上配置未完成：{error}')
    if '--data-dir' in sys.argv:
        print(values['CASE_HUB_DATA_DIR'])
    else:
        print('线上设置检查通过（未输出密钥）。')
