/**
 * RC2-N4 — one SEC fair-access identity, from configuration.
 *
 * Before this slice the tree carried FOUR independently constructed identities
 * across THREE domains:
 *
 *   app/feeds.py                    "Argus-AI/1.0 (contact: research@argus.example)"
 *   api/ipo-pipeline/route.ts       "Argus Intelligence research@argusintel.com"
 *   lib/dataAdapters/sec/index.ts   "Argus Research argus-data@example.com"
 *   scripts/refresh_sec_tickers.py  "Argus-AI/1.0 (contact: support@argus-market-intelligence.com)"
 *
 * `argus.example` and `example.com` are RFC 2606 reserved — they can never be a
 * valid contact. The fourth address was not established as a provisioned mailbox
 * by any other authority on main, so it was NOT adopted as a hardcoded value.
 *
 * The contact comes from ARGUS_SEC_CONTACT with no default. Python and these
 * route handlers cannot import one shared constant, so both runtimes read the
 * same variable and build the same string. The FORMAT is pinned identically on
 * both sides — here, and in tests/test_sec_identity.py.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SEC_APP_IDENTITY, secContact, secUserAgent, requireSecUserAgent, SecContactMissingError,
} from "../secIdentity";

const ROOT = resolve(__dirname, "../../../..");
const BANNED = ["research@argus.example", "argus-data@example.com", "research@argusintel.com"];

const original = process.env.ARGUS_SEC_CONTACT;
beforeEach(() => { delete process.env.ARGUS_SEC_CONTACT; });
afterEach(() => {
  if (original === undefined) delete process.env.ARGUS_SEC_CONTACT;
  else process.env.ARGUS_SEC_CONTACT = original;
});

// ── The canonical identity ──────────────────────────────────────────────────

describe("the canonical SEC identity", () => {
  it("uses one application identity", () => {
    expect(SEC_APP_IDENTITY).toBe("Argus Market Intelligence");
  });

  it("is identity + contact", () => {
    process.env.ARGUS_SEC_CONTACT = "ops@example.org";
    expect(secUserAgent()).toBe("Argus Market Intelligence ops@example.org");
  });

  it("matches the backend format exactly (cross-runtime pin)", () => {
    // tests/test_sec_identity.py asserts the identical string for the identical
    // contact. If either side changes format, one of the two suites fails.
    process.env.ARGUS_SEC_CONTACT = "ops@example.org";
    expect(secUserAgent()).toBe(`${SEC_APP_IDENTITY} ops@example.org`);
    const py = readFileSync(resolve(ROOT, "app/feeds.py"), "utf8");
    expect(py).toContain('_SEC_APP_IDENTITY = "Argus Market Intelligence"');
    expect(py).toContain('f"{_SEC_APP_IDENTITY} {contact}"');
  });

  it("trims whitespace around the contact", () => {
    process.env.ARGUS_SEC_CONTACT = "  ops@example.org  ";
    expect(secContact()).toBe("ops@example.org");
    expect(secUserAgent()).toBe("Argus Market Intelligence ops@example.org");
  });
});

// ── No default, ever ────────────────────────────────────────────────────────

describe("there is no default contact", () => {
  it("unset yields null", () => {
    expect(secUserAgent()).toBeNull();
  });

  it("empty yields null", () => {
    process.env.ARGUS_SEC_CONTACT = "";
    expect(secUserAgent()).toBeNull();
  });

  it("whitespace-only yields null", () => {
    process.env.ARGUS_SEC_CONTACT = "   ";
    expect(secUserAgent()).toBeNull();
  });

  it("requireSecUserAgent throws rather than substituting", () => {
    expect(() => requireSecUserAgent()).toThrow(SecContactMissingError);
  });

  it("no banned placeholder can ever be produced", () => {
    for (const value of [undefined, "", "   "]) {
      if (value === undefined) delete process.env.ARGUS_SEC_CONTACT;
      else process.env.ARGUS_SEC_CONTACT = value;
      expect(secUserAgent()).toBeNull();
    }
    process.env.ARGUS_SEC_CONTACT = "ops@example.org";
    const ua = secUserAgent() ?? "";
    for (const bad of BANNED) expect(ua).not.toContain(bad);
  });
});

// ── Every SEC caller derives its identity from the module ───────────────────

describe("every SEC caller uses the canonical identity", () => {
  const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
  /** Source lines that are not comments. */
  const codeOf = (src: string) => src.split("\n")
    .filter(l => { const t = l.trim(); return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")); })
    .join("\n");

  const CALLERS = [
    "frontend/src/app/api/ipo-pipeline/route.ts",
    "frontend/src/lib/dataAdapters/sec/index.ts",
  ];

  for (const f of CALLERS) {
    it(`${f} imports the shared identity`, () => {
      expect(read(f)).toMatch(/from "(@\/lib\/secIdentity|\.\.\/\.\.\/secIdentity)"/);
    });

    it(`${f} contains no banned contact in code`, () => {
      const code = codeOf(read(f));
      for (const bad of BANNED) expect(code).not.toContain(bad);
    });

    it(`${f} has no hardcoded SEC User-Agent literal`, () => {
      const code = codeOf(read(f));
      expect(code).not.toMatch(/"User-Agent":\s*"[^"]*@/);
    });
  }
});

// ── C2b request shape is untouched ──────────────────────────────────────────

describe("C2b endpoints, parsing and narrowing are unchanged", () => {
  const route = readFileSync(resolve(ROOT, "frontend/src/app/api/ipo-pipeline/route.ts"), "utf8");

  it("the EDGAR atom endpoint and its parameters are byte-identical", () => {
    expect(route).toContain(
      'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-1&dateb=&owner=include&count=40&search_text=&output=atom');
  });

  it("the submissions enrichment endpoint is unchanged", () => {
    expect(route).toContain("https://data.sec.gov/submissions/CIK${padded}.json");
  });

  it("S-1 vs S-1/A form classification is untouched", () => {
    expect(route).toContain("S-1/A");
  });

  it("the enrichment cap and slice bounds are unchanged", () => {
    expect(route).toContain("parseAtomFeed(xml).slice(0, 30)");
    expect(route).toContain("parsed.slice(0, 15)");
    expect(route).toContain("parsed.slice(15)");
  });

  it("the cache/failure idiom is reused, not replaced", () => {
    // The missing-config path returns the SAME shape as an EDGAR outage:
    // stale cache when present, else an empty list, with status 502.
    expect(route).toContain("_cache?.data ?? []");
    expect(route.match(/status: 502/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("the SEC adapter's endpoints are unchanged", () => {
    const sec = readFileSync(resolve(ROOT, "frontend/src/lib/dataAdapters/sec/index.ts"), "utf8");
    expect(sec).toContain("https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json");
    expect(sec).toContain("https://data.sec.gov/submissions/CIK${cik}.json");
  });
});

// ── The generic RSS UA is deliberately untouched ────────────────────────────

describe("the non-SEC feed identity is not in scope", () => {
  it("the generic RSS User-Agent is still Argus-AI/1.0", () => {
    const feeds = readFileSync(resolve(ROOT, "app/feeds.py"), "utf8");
    // _fetch_feed serves every registry URL (Reuters, Bloomberg, ...), which is
    // not a SEC fair-access path and was explicitly out of scope.
    expect(feeds).toContain('request_headers={"User-Agent": "Argus-AI/1.0"}');
  });

  it("the FRED credit-spread caller is untouched", () => {
    const cs = readFileSync(resolve(ROOT, "frontend/src/app/api/credit-spread/route.ts"), "utf8");
    expect(cs).toContain('"User-Agent": "Argus-AI/1.0"');
  });
});
