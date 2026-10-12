#!/usr/bin/env python3
"""Bounded, read-only smoke load for a private Case Hub pilot."""

from __future__ import annotations

import argparse
import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
from getpass import getpass
import json
import statistics
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


OPENER = build_opener(NoRedirect)


def fetch(base_url: str, path: str, authorization: str) -> tuple[int, float, dict | None]:
    request = Request(f"{base_url}{path}", headers={"Authorization": authorization})
    started = time.monotonic()
    try:
        with OPENER.open(request, timeout=15) as response:
            payload = response.read()
            status = response.status
    except HTTPError as error:
        return error.code, time.monotonic() - started, None
    except (URLError, TimeoutError):
        return 0, time.monotonic() - started, None
    try:
        body = json.loads(payload)
    except (ValueError, UnicodeDecodeError):
        body = None
    return status, time.monotonic() - started, body


def percentile(values: list[float], percentage: float) -> float:
    ordered = sorted(values)
    position = max(0, min(len(ordered) - 1, int((len(ordered) - 1) * percentage)))
    return ordered[position]


def main() -> int:
    parser = argparse.ArgumentParser(description="Small read-only load check for SJTU Cloud pilot")
    parser.add_argument("base_url", help="HTTPS origin of the private Case Hub")
    parser.add_argument("username", help="Nginx Basic Auth test account")
    parser.add_argument("--users", type=int, default=10, help="Concurrent simulated readers, 1-30")
    parser.add_argument("--rounds", type=int, default=5, help="List/detail pairs per reader, 1-20")
    args = parser.parse_args()

    parsed = urlparse(args.base_url)
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password or parsed.path not in ("", "/"):
        parser.error("base_url must be an HTTPS origin without credentials or a path")
    if not 1 <= args.users <= 30 or not 1 <= args.rounds <= 20:
        parser.error("users must be 1-30 and rounds must be 1-20")

    password = getpass("Nginx test account password: ")
    if not password:
        parser.error("password cannot be empty")
    token = base64.b64encode(f"{args.username}:{password}".encode()).decode()
    authorization = f"Basic {token}"
    base_url = args.base_url.rstrip("/")

    status, _, body = fetch(base_url, "/api/cases?limit=10", authorization)
    if status != 200 or not isinstance(body, dict) or not isinstance(body.get("data"), list):
        print(f"Preflight failed: case list returned HTTP {status}")
        return 1
    case_ids = [item.get("id") for item in body["data"] if isinstance(item, dict) and isinstance(item.get("id"), str)]
    if not case_ids:
        print("Preflight failed: no visible cases to test")
        return 1

    def reader(reader_number: int) -> list[tuple[int, float]]:
        results = []
        for round_number in range(args.rounds):
            results.append(fetch(base_url, f"/api/cases?page={round_number + 1}&limit=10", authorization)[:2])
            case_id = case_ids[(reader_number + round_number) % len(case_ids)]
            results.append(fetch(base_url, f"/api/cases/{case_id}", authorization)[:2])
        return results

    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=args.users) as pool:
        futures = [pool.submit(reader, number) for number in range(args.users)]
        results = [result for future in as_completed(futures) for result in future.result()]
    elapsed = time.monotonic() - started
    latencies = [duration for status, duration in results if status == 200]
    failures = [status for status, _ in results if status != 200]
    print(f"Requests: {len(results)} | readers: {args.users} | elapsed: {elapsed:.2f}s")
    print(f"Success: {len(latencies)} | failure: {len(failures)} | status codes: {sorted(set(failures))}")
    if latencies:
        print(f"Latency: median {statistics.median(latencies):.3f}s | p95 {percentile(latencies, 0.95):.3f}s")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
