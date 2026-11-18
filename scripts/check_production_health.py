"""Bounded external probe of redacted readiness, never a pipeline refresh."""
import json
import urllib.error
import urllib.request


TARGETS = (
    "https://argus-market-intelligence.com/api/health/ready",
    "https://perceptive-achievement-production-475a.up.railway.app/api/health/ready",
)


def validate(payload):
    return (isinstance(payload, dict) and payload.get("ready") is True
            and payload.get("pipeline_ready") is True
            and payload.get("persistence_ready") is True
            and payload.get("source_coverage") in {"complete", "partial"})


def main():
    failed = False
    for url in TARGETS:
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Argus-Readiness-Monitor/1.0"})
            with urllib.request.urlopen(request, timeout=15) as response:
                body = response.read(16385)
                if len(body) > 16384:
                    raise ValueError("oversized response")
                payload = json.loads(body)
                if not validate(payload):
                    raise ValueError("readiness not established")
            print(f"Ready: {url}")
            if payload["source_coverage"] == "partial":
                print(f"::warning::Partial publisher coverage at {url}")
        except (OSError, ValueError, urllib.error.URLError):
            # Do not print arbitrary response bodies or exception text.
            print(f"::error::Readiness check failed at {url}")
            failed = True
    return int(failed)


if __name__ == "__main__":
    raise SystemExit(main())
