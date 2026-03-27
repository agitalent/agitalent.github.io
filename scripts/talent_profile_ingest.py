#!/usr/bin/env python3

import argparse
import http.client
import json
import os
import re
import select
import socket
import ssl
import subprocess
import sys
import termios
import time
import tty
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Optional, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urljoin, urlparse
from urllib.request import Request, urlopen


DEFAULT_INPUT_PATH = Path("/Users/owenzu/talentsearch.txt")
DEFAULT_STATE_PATH = Path(os.environ.get("TALENT_PROFILE_INGEST_STATE", str(Path.home() / ".openclaw" / "talent-profile-ingest-state.json")))
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)
DEFAULT_MODEL = os.environ.get("BAILIAN_MODEL", "qwen-turbo")
DEFAULT_BAILIAN_BASE_URL = os.environ.get("BAILIAN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1")
DEFAULT_BAILIAN_RETRY_SECONDS = int(os.environ.get("BAILIAN_RETRY_SECONDS", "60"))
DEFAULT_BAILIAN_MAX_RETRIES = int(os.environ.get("BAILIAN_MAX_RETRIES", "12"))
DEFAULT_SOURCE_FETCH_RETRIES = int(os.environ.get("SOURCE_FETCH_RETRIES", "3"))
SPACE_RE = re.compile(r"\s+")
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
SOURCE_RE = re.compile(r"^--- Sourced on (?P<timestamp>.+?) from (?P<source>https?://\S+) ---$")
JSON_BLOCK_RE = re.compile(r"\{.*\}", re.S)


def normalize_space(text: str) -> str:
    return SPACE_RE.sub(" ", text or "").strip()


def canonicalize_github_url(url: str) -> Optional[str]:
    parsed = urlparse((url or "").strip())
    if parsed.scheme not in {"http", "https"}:
        return None
    host = (parsed.netloc or "").lower()
    if not host.endswith("github.io"):
        return None
    path = parsed.path.rstrip("/")
    if not path:
        return f"https://{host}/"
    return f"https://{host}{path}"


def canonicalize_github_root_url(url: str) -> Optional[str]:
    parsed = urlparse((url or "").strip())
    if parsed.scheme not in {"http", "https"}:
        return None
    host = (parsed.netloc or "").lower()
    if not host.endswith("github.io"):
        return None
    return f"https://{host}/"


def json_dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=True, indent=2, sort_keys=True)


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"completed_sources": {}, "failed_sources": {}, "last_run_at": None}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"completed_sources": {}, "failed_sources": {}, "last_run_at": None}
    if not isinstance(data, dict):
        return {"completed_sources": {}, "failed_sources": {}, "last_run_at": None}

    completed = data.get("completed_sources")
    failed = data.get("failed_sources")

    if not isinstance(completed, dict):
        completed = {}
    if not isinstance(failed, dict):
        failed = {}

    # Backward compatibility for older state files that used a single processed_sources bucket.
    legacy_processed = data.get("processed_sources")
    if isinstance(legacy_processed, dict):
        for source_url, record in legacy_processed.items():
            if not isinstance(record, dict):
                completed[source_url] = {"status": "processed"}
                continue
            status = str(record.get("status") or "").lower()
            if status in {"error", "fatal", "skipped_non_profile"}:
                failed[source_url] = record
            else:
                completed[source_url] = record
    return {
        "completed_sources": completed,
        "failed_sources": failed,
        "last_run_at": data.get("last_run_at"),
    }


def save_state(path: Path, state: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json_dumps(state) + "\n", encoding="utf-8")


def record_source_state(
    state: dict[str, Any],
    state_path: Path,
    source_url: str,
    *,
    status: str,
    profile_id: Optional[str] = None,
    email: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    record = {
        "processed_at": datetime.now().isoformat(timespec="seconds"),
        "status": status,
        "profile_id": profile_id,
        "email": email,
        "error": error,
    }
    if status in {"created", "updated", "dry_run"}:
        state["completed_sources"][source_url] = record
        state["failed_sources"].pop(source_url, None)
    else:
        state["failed_sources"][source_url] = record
        state["completed_sources"].pop(source_url, None)
    state["last_run_at"] = datetime.now().isoformat(timespec="seconds")
    save_state(state_path, state)


def http_request(url: str, *, method: str = "GET", headers: Optional[dict[str, str]] = None, body: Optional[bytes] = None, timeout: float = 30.0) -> Tuple[int, dict[str, str], bytes]:
    request = Request(
        url,
        method=method,
        data=body,
        headers={
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            **(headers or {}),
        },
    )
    with urlopen(request, timeout=timeout) as response:
        return response.status, dict(response.headers.items()), response.read()


def http_json(url: str, *, method: str = "GET", headers: Optional[dict[str, str]] = None, body: Any = None, timeout: float = 30.0) -> Any:
    payload = None
    merged_headers = {"Accept": "application/json"}
    if headers:
        merged_headers.update(headers)
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        merged_headers.setdefault("Content-Type", "application/json")
    _, response_headers, raw = http_request(url, method=method, headers=merged_headers, body=payload, timeout=timeout)
    charset = "utf-8"
    content_type = response_headers.get("Content-Type", "")
    match = re.search(r"charset=([^\s;]+)", content_type, re.I)
    if match:
        charset = match.group(1)
    return json.loads(raw.decode(charset, errors="replace"))


def http_text(url: str, *, timeout: float = 30.0) -> str:
    try:
        _, headers, raw = http_request(url, timeout=timeout)
    except (TimeoutError, socket.timeout) as exc:
        raise RuntimeError(f"request timed out for {url}: {exc}") from exc
    except (http.client.IncompleteRead, http.client.RemoteDisconnected, ConnectionResetError, TimeoutError, socket.timeout, ssl.SSLError, OSError):
        raw = curl_fetch(url, timeout=timeout)
        headers = {"Content-Type": "text/html; charset=utf-8"}
    except HTTPError as exc:
        if exc.code != 403:
            raise
        raw = curl_fetch(url, timeout=timeout)
        headers = {"Content-Type": "text/html; charset=utf-8"}
    charset = "utf-8"
    content_type = headers.get("Content-Type", "")
    match = re.search(r"charset=([^\s;]+)", content_type, re.I)
    if match:
        charset = match.group(1)
    return raw.decode(charset, errors="replace")


def curl_fetch(url: str, *, timeout: float = 30.0) -> bytes:
    command = [
        "curl",
        "-fsSL",
        "--http1.1",
        "--max-time",
        str(int(timeout)),
        "-A",
        DEFAULT_USER_AGENT,
        "-H",
        "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "-H",
        "Accept-Language: en-US,en;q=0.9",
        "-H",
        "Cache-Control: no-cache",
        "-H",
        "Pragma: no-cache",
        url,
    ]
    last_error = ""
    attempts = max(1, DEFAULT_SOURCE_FETCH_RETRIES + 1)
    for attempt in range(1, attempts + 1):
        try:
            return subprocess.check_output(command, stderr=subprocess.STDOUT)
        except subprocess.CalledProcessError as exc:
            output = exc.output.decode("utf-8", errors="replace").strip()
            last_error = output or str(exc)
            lowered = last_error.lower()
            if "timed out" in lowered or "operation timeout" in lowered or "max-time" in lowered:
                raise RuntimeError(f"curl fallback timed out for {url}: {last_error}") from exc
            if attempt >= attempts:
                break
            time.sleep(2)
    raise RuntimeError(f"curl fallback failed for {url}: {last_error}")


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[Tuple[str, Optional[str]]]) -> None:
        if tag.lower() != "a":
            return
        attr_map = {key.lower(): value for key, value in attrs}
        href = attr_map.get("href")
        if href:
            self.links.append(href)


class TextParser(HTMLParser):
    SKIP_TAGS = {"script", "style", "noscript", "svg", "canvas", "iframe"}
    BLOCK_TAGS = {
        "address",
        "article",
        "aside",
        "blockquote",
        "br",
        "dd",
        "div",
        "dl",
        "dt",
        "fieldset",
        "figcaption",
        "figure",
        "footer",
        "form",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "header",
        "hr",
        "li",
        "main",
        "nav",
        "p",
        "pre",
        "section",
        "table",
        "td",
        "tr",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[Tuple[str, Optional[str]]]) -> None:
        lowered = tag.lower()
        if lowered in self.SKIP_TAGS:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if lowered in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        if lowered in self.SKIP_TAGS and self.skip_depth:
            self.skip_depth -= 1
            return
        if self.skip_depth:
            return
        if lowered in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        text = normalize_space(unescape(data))
        if text:
            self.parts.append(text)

    def text(self) -> str:
        lines = [normalize_space(line) for line in "".join(self.parts).splitlines()]
        lines = [line for line in lines if line]
        return "\n".join(lines)


@dataclass
class SourceEntry:
    source_url: str
    timestamp: str


class SupabaseClient:
    def __init__(self, url: str, key: str, db_url: Optional[str] = None) -> None:
        self.url = url.rstrip("/")
        self.key = key
        self.db_url = db_url

    def _headers(self, *, extra: Optional[dict[str, str]] = None, prefer: Optional[str] = "return=representation") -> dict[str, str]:
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        if extra:
            headers.update(extra)
        return headers

    def request(self, table_or_path: str, *, method: str = "GET", query: Optional[str] = None, body: Any = None, headers: Optional[dict[str, str]] = None, prefer: Optional[str] = "return=representation") -> Any:
        url = f"{self.url}/rest/v1/{table_or_path.lstrip('/')}"
        if query:
            url = f"{url}?{query}"
        try:
            return http_json(url, method=method, headers=self._headers(extra=headers, prefer=prefer), body=body)
        except HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supabase {method} {table_or_path} failed: {exc.code} {detail}") from exc

    def fetch_profile_columns(self) -> set[str]:
        openapi_url = f"{self.url}/rest/v1/"
        try:
            spec = http_json(
                openapi_url,
                headers={
                    "apikey": self.key,
                    "Authorization": f"Bearer {self.key}",
                    "Accept": "application/openapi+json",
                },
            )
        except Exception:
            rows = self.request("profiles", query="select=*&limit=1", prefer=None)
            if rows:
                return set(rows[0].keys())
            return set()

        definitions = spec.get("definitions", {})
        schemas = spec.get("components", {}).get("schemas", {})
        for definition in [*definitions.values(), *schemas.values()]:
            properties = definition.get("properties")
            if not isinstance(properties, dict):
                continue
            if "name_or_handle" in properties and "agent_type" in properties:
                return set(properties.keys())
        return set()

    def ensure_email_column(self) -> None:
        columns = self.fetch_profile_columns()
        if "email" in columns:
            return
        if not self.db_url:
            raise RuntimeError(
                "Supabase profiles.email is missing. Run `alter table profiles add column if not exists email text;` "
                "or set SUPABASE_DB_URL so this script can repair it automatically."
            )
        try:
            import psycopg
        except ImportError as exc:
            raise RuntimeError(
                "Supabase profiles.email is missing and psycopg is not installed. Install `psycopg` or add the column manually: "
                "`alter table profiles add column if not exists email text;`"
            ) from exc
        with psycopg.connect(self.db_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute("alter table profiles add column if not exists email text;")
            connection.commit()

    def upsert_profile(self, payload: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        rows = self.request("profiles", method="POST", body=payload)
        row = rows[0]
        self.request(
            "events",
            method="POST",
            body={
                "event_type": "NEW_PROFILE",
                "entity_type": "profile",
                "entity_id": row["id"],
                "producer_agent_type": payload.get("agent_type"),
                "payload": {
                    "name_or_handle": row.get("name_or_handle"),
                    "location": row.get("location"),
                    "bio_link": row.get("bio_link"),
                    "email": row.get("email"),
                },
            },
        )
        return "created", row


class BailianQuotaError(RuntimeError):
    pass


class PauseController:
    def __init__(self) -> None:
        self.enabled = sys.stdin.isatty()
        self.paused = False
        self._fd: Optional[int] = None
        self._old_attrs = None
        if not self.enabled:
            return
        self._fd = sys.stdin.fileno()
        self._old_attrs = termios.tcgetattr(self._fd)
        tty.setcbreak(self._fd)
        print(json.dumps({"event": "keyboard_control", "message": "Press space to pause/resume."}, ensure_ascii=True), flush=True)

    def close(self) -> None:
        if self._fd is not None and self._old_attrs is not None:
            termios.tcsetattr(self._fd, termios.TCSADRAIN, self._old_attrs)
            self._fd = None
            self._old_attrs = None

    def _poll_key(self) -> Optional[str]:
        if not self.enabled or self._fd is None:
            return None
        readable, _, _ = select.select([sys.stdin], [], [], 0)
        if not readable:
            return None
        return os.read(self._fd, 1).decode("utf-8", errors="ignore")

    def checkpoint(self) -> None:
        while True:
            key = self._poll_key()
            if key != " ":
                return
            self.paused = not self.paused
            print(
                json.dumps(
                    {"event": "paused" if self.paused else "resumed", "message": "Space pressed."},
                    ensure_ascii=True,
                ),
                flush=True,
            )
            while self.paused:
                time.sleep(0.2)
                key = self._poll_key()
                if key == " ":
                    self.paused = False
                    print(json.dumps({"event": "resumed", "message": "Space pressed."}, ensure_ascii=True), flush=True)
                    break


def read_talent_sources(path: Path) -> list[SourceEntry]:
    entries: list[SourceEntry] = []
    last_timestamp = ""
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        source_match = SOURCE_RE.match(line)
        if source_match:
            last_timestamp = source_match.group("timestamp")
            source_url = source_match.group("source")
            normalized = canonicalize_github_url(source_url)
            if normalized:
                entries.append(SourceEntry(source_url=normalized, timestamp=last_timestamp))
            continue
        normalized = canonicalize_github_url(line)
        if normalized:
            entries.append(SourceEntry(source_url=normalized, timestamp=last_timestamp or ""))
    return entries


def collect_known_links(path: Path) -> set[str]:
    known: set[str] = set()
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        normalized = canonicalize_github_root_url(raw_line.strip())
        if normalized:
            known.add(normalized)
    return known


def append_links(path: Path, source_url: str, links: Iterable[str]) -> int:
    links = [link for link in links if link]
    if not links:
        return 0
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    block = [f"\n--- Sourced on {timestamp} from {source_url} ---\n"]
    block.extend(f"{link}\n" for link in links)
    with path.open("a", encoding="utf-8") as handle:
        handle.writelines(block)
    return len(links)


def extract_page_text_and_links(url: str, *, timeout: float = 30.0) -> tuple[str, list[str]]:
    html = http_text(url, timeout=timeout)
    text_parser = TextParser()
    text_parser.feed(html)
    text_parser.close()

    link_parser = LinkParser()
    link_parser.feed(html)
    link_parser.close()

    normalized_links: list[str] = []
    all_page_urls: list[str] = []
    seen_github: set[str] = set()
    seen_urls: set[str] = set()
    for href in link_parser.links:
        joined = urljoin(url, href)
        if joined not in seen_urls:
            seen_urls.add(joined)
            all_page_urls.append(joined)
        canonical = canonicalize_github_root_url(joined)
        if not canonical or canonical == canonicalize_github_root_url(url) or canonical in seen_github:
            continue
        seen_github.add(canonical)
        normalized_links.append(canonical)

    page_text = text_parser.text()
    url_text = "\n".join(all_page_urls)
    if url_text:
        page_text = f"{page_text}\n\nPage URLs:\n{url_text}" if page_text else f"Page URLs:\n{url_text}"
    return page_text, normalized_links


def truncate_text(text: str, max_chars: int = 16000) -> str:
    text = text.strip()
    if len(text) <= max_chars:
        return text
    return text[:max_chars]


def coerce_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        items = value
    else:
        items = re.split(r"[\n,;|]+", str(value))
    result: list[str] = []
    seen: set[str] = set()
    for item in items:
        text = normalize_space(str(item))
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(text)
    return result


def infer_email(text: str, url: str) -> Optional[str]:
    matches = EMAIL_RE.findall(text or "")
    if matches:
        return matches[0].lower()
    mailto_match = re.search(r"mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})", text or "", re.I)
    if mailto_match:
        return mailto_match.group(1).lower()
    parsed = urlparse(url)
    slug = parsed.netloc.split(".")[0].strip().lower()
    if slug:
        return f"{slug}@unknown.invalid"
    return None


def build_prompt(url: str, page_text: str) -> list[dict[str, str]]:
    schema = {
        "is_candidate_profile": "boolean; true only for a person's profile/homepage/portfolio/lab-member page primarily about that candidate, false for project pages, paper pages, benchmarks, tools, courses, or generic lab/group sites",
        "name_or_handle": "string",
        "email": "string, required; if no real email exists, create a stable placeholder like handle@unknown.invalid",
        "bio_link": "string",
        "location": "string or null",
        "timezone": "string or null",
        "domain_focus": "string or null",
        "seniority": "string or null; include current role/company plus education degree and university/school when available",
        "availability": "string or null",
        "needs": ["string"],
    }
    return [
        {
            "role": "system",
            "content": (
                "Decide whether the page is a candidate profile. "
                "Return JSON only, no markdown. Use the schema exactly. "
                "If the page is mainly a project page, paper page, benchmark page, tool page, course page, organization page, or lab/group homepage instead of one person's profile, set is_candidate_profile to false. "
                "Only set is_candidate_profile to true when the page is primarily about one candidate person. "
                "Use evidence from the text. Do not invent a real email; if none is visible, create a placeholder "
                "using the page handle and the domain unknown.invalid. "
                "Use both visible page text and the listed page URLs. "
                "If a page URL contains mailto:, extract the real email. "
                "Set seniority to include role/company and degree/school context when available, for example "
                "'PhD student, Stanford University; Research Intern, Google DeepMind'. "
                "Do not return skills. "
                "Do not return recent_evidence."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Source URL: {url}\n"
                f"Required JSON schema:\n{json_dumps(schema)}\n\n"
                f"Page text:\n{truncate_text(page_text)}"
            ),
        },
    ]


def bailian_extract(api_key: str, model: str, url: str, page_text: str) -> dict[str, Any]:
    try:
        response = http_json(
            f"{DEFAULT_BAILIAN_BASE_URL.rstrip('/')}/chat/completions",
            method="POST",
            headers={
                "Authorization": f"Bearer {api_key}",
            },
            body={
                "model": model,
                "messages": build_prompt(url, page_text),
                "temperature": 0,
                "response_format": {"type": "json_object"}
            },
            timeout=90.0,
        )
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        if exc.code == 403:
            try:
                payload = json.loads(detail)
            except json.JSONDecodeError:
                payload = {}
            error = payload.get("error") if isinstance(payload, dict) else {}
            code = error.get("code") if isinstance(error, dict) else None
            if code == "AllocationQuota.FreeTierOnly":
                raise BailianQuotaError(
                    "Bailian free tier quota is exhausted for this API key. Disable 'use free tier only' in the Bailian console or use a key with paid quota."
                ) from exc
        raise RuntimeError(f"Bailian HTTP {exc.code} {exc.reason}: {detail}") from exc
    except (URLError, http.client.RemoteDisconnected, ConnectionResetError, TimeoutError, socket.timeout, ssl.SSLError, OSError) as exc:
        raise RuntimeError(f"Bailian request failed for {url}: {type(exc).__name__}: {exc}") from exc
    content = response["choices"][0]["message"]["content"]
    if isinstance(content, list):
        content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
    if isinstance(content, dict):
        return content
    if not isinstance(content, str):
        raise RuntimeError(f"Unexpected OpenRouter response shape for {url}: {content!r}")
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        match = JSON_BLOCK_RE.search(content)
        if not match:
            raise
        return json.loads(match.group(0))


def normalize_profile_payload(raw: dict[str, Any], source_url: str, page_text: str) -> dict[str, Any]:
    payload = {
        "agent_type": "job_seeker",
        "name_or_handle": normalize_space(str(raw.get("name_or_handle") or raw.get("name") or source_url)),
        "email": normalize_space(str(raw.get("email") or infer_email(page_text, source_url) or "")) or None,
        "bio_link": raw.get("bio_link") or source_url,
        "location": normalize_space(str(raw.get("location") or "")) or None,
        "timezone": normalize_space(str(raw.get("timezone") or "")) or None,
        "domain_focus": normalize_space(str(raw.get("domain_focus") or "")) or None,
        "seniority": normalize_space(str(raw.get("seniority") or "")) or None,
        "skills": [],
        "needs": coerce_list(raw.get("needs")),
        "recent_evidence": [],
        "availability": normalize_space(str(raw.get("availability") or "active")) or "active",
        "delivery_route": "hub_notification",
        "status": "active",
    }
    if not payload["email"]:
        raise RuntimeError(f"Could not determine email or placeholder for {source_url}")
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract GitHub.io candidate profiles, append newly discovered links, and upsert into Supabase.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT_PATH, help="Path to talentsearch.txt")
    parser.add_argument("--limit", type=int, default=0, help="Only process the first N source URLs")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="OpenRouter model")
    parser.add_argument("--bailian-key", default=os.environ.get("BAILIAN_API_KEY"), help="Alibaba Bailian API key")
    parser.add_argument("--supabase-url", default=os.environ.get("SUPABASE_URL"), help="Supabase project URL")
    parser.add_argument(
        "--supabase-key",
        default=(
            os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
            or os.environ.get("SUPABASE_ANON_KEY")
            or os.environ.get("SUPABASE_KEY")
        ),
        help="Supabase REST key",
    )
    parser.add_argument("--supabase-db-url", default=os.environ.get("SUPABASE_DB_URL"), help="Optional Postgres URL for schema repair")
    parser.add_argument("--state-file", type=Path, default=DEFAULT_STATE_PATH, help="Checkpoint file used to skip already processed sources")
    parser.add_argument("--restart", action="store_true", help="Ignore saved processed-source state and process from the beginning")
    parser.add_argument("--dry-run", action="store_true", help="Do not write to Supabase or append links")
    parser.add_argument("--timeout", type=float, default=30.0, help="HTTP timeout in seconds")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.input.exists():
        raise SystemExit(f"Input file not found: {args.input}")
    if not args.bailian_key:
        raise SystemExit("Missing Bailian API key. Use --bailian-key or BAILIAN_API_KEY.")
    if not args.supabase_url or not args.supabase_key:
        raise SystemExit("Missing Supabase credentials. Use --supabase-url and --supabase-key or env vars.")

    supabase = SupabaseClient(args.supabase_url, args.supabase_key, db_url=args.supabase_db_url)
    supabase.ensure_email_column()

    state = {"completed_sources": {}, "failed_sources": {}, "last_run_at": None} if args.restart else load_state(args.state_file)
    known_links = collect_known_links(args.input)
    sources = read_talent_sources(args.input)
    if args.limit > 0:
        sources = sources[: args.limit]
    skipped_sources = set(state["completed_sources"]) | set(state["failed_sources"])
    pending_sources = [entry for entry in sources if entry.source_url not in skipped_sources]

    controller = PauseController()
    try:
        summary: list[dict[str, Any]] = []
        for index, entry in enumerate(pending_sources, start=1):
            controller.checkpoint()
            source_url = entry.source_url
            row_result = {
                "source_url": source_url,
                "status": "pending",
                "new_links": 0,
            }
            try:
                page_text, discovered_links = extract_page_text_and_links(source_url, timeout=args.timeout)
                new_links = [link for link in discovered_links if link not in known_links]
                for link in new_links:
                    known_links.add(link)
                if new_links and not args.dry_run:
                    append_links(args.input, source_url, new_links)

                controller.checkpoint()
                extracted = bailian_extract(args.bailian_key, args.model, source_url, page_text)
                if not bool(extracted.get("is_candidate_profile")):
                    row_result.update(
                        {
                            "status": "skipped_non_profile",
                            "new_links": len(new_links),
                        }
                    )
                    if not args.dry_run:
                        record_source_state(
                            state,
                            args.state_file,
                            source_url,
                            status="skipped_non_profile",
                        )
                    summary.append(row_result)
                    print(json.dumps({"progress": index, "total": len(pending_sources), **row_result}, ensure_ascii=True), flush=True)
                    continue
                payload = normalize_profile_payload(extracted, source_url, page_text)
                if args.dry_run:
                    action = "dry_run"
                    record = {"payload": payload}
                else:
                    action, record = supabase.upsert_profile(payload)

                row_result.update(
                    {
                        "status": action,
                        "name_or_handle": payload["name_or_handle"],
                        "email": payload["email"],
                        "new_links": len(new_links),
                        "profile_id": record.get("id"),
                    }
                )
                if not args.dry_run:
                    record_source_state(
                        state,
                        args.state_file,
                        source_url,
                        status=action,
                        profile_id=record.get("id"),
                        email=payload["email"],
                    )
            except BailianQuotaError as exc:
                row_result.update({"status": "fatal", "error": str(exc)})
                if not args.dry_run:
                    record_source_state(
                        state,
                        args.state_file,
                        source_url,
                        status="fatal",
                        error=str(exc),
                    )
                summary.append(row_result)
                print(json.dumps({"progress": index, "total": len(pending_sources), **row_result}, ensure_ascii=True), flush=True)
                print(json_dumps({"completed": len(summary), "skipped_completed_sources": len(sources) - len(pending_sources), "results": summary, "state_file": str(args.state_file)}))
                return 2
            except HTTPError as exc:
                row_result.update({"status": "error", "error": f"{exc.code} {exc.reason} during network request"})
                if not args.dry_run:
                    record_source_state(
                        state,
                        args.state_file,
                        source_url,
                        status="error",
                        error=row_result["error"],
                    )
            except (URLError, RuntimeError, json.JSONDecodeError, http.client.IncompleteRead, http.client.RemoteDisconnected, ConnectionResetError, TimeoutError, socket.timeout, ssl.SSLError, OSError) as exc:
                row_result.update({"status": "error", "error": str(exc)})
                if not args.dry_run:
                    record_source_state(
                        state,
                        args.state_file,
                        source_url,
                        status="error",
                        error=row_result["error"],
                    )
            summary.append(row_result)
            print(json.dumps({"progress": index, "total": len(pending_sources), **row_result}, ensure_ascii=True), flush=True)

        skipped = len(sources) - len(pending_sources)
        print(json_dumps({"completed": len(summary), "skipped_completed_sources": skipped, "results": summary, "state_file": str(args.state_file)}))
        return 0
    finally:
        controller.close()


if __name__ == "__main__":
    sys.exit(main())
