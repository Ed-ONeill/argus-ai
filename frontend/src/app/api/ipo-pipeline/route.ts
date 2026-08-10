import { NextResponse } from "next/server";

export interface IPOFiler {
  companyName:       string;
  cik:               string;
  filingDate:        string;
  accessionNumber:   string;
  sic:               string | null;
  sicDescription:    string | null;
  stateOfIncorp:     string | null;
  sector:            string | null;
}

// ── Module-level 1-hour cache ─────────────────────────────────────────────────

interface CacheEntry { data: IPOFiler[]; fetchedAt: number }
let _cache: CacheEntry | null = null;
const CACHE_TTL = 60 * 60 * 1_000; // 1 hour

const UA = "Argus Intelligence support@argus-market-intelligence.com";

// ── SIC → sector mapping (abbreviated) ───────────────────────────────────────

const SIC_SECTOR: Record<string, string> = {
  "7372": "Technology", "7371": "Technology", "7374": "Technology",
  "7379": "Technology", "7389": "Technology", "3674": "Technology",
  "3672": "Technology", "3669": "Technology", "3679": "Technology",
  "2836": "Healthcare", "2835": "Healthcare", "2834": "Healthcare",
  "8011": "Healthcare", "8099": "Healthcare", "3841": "Healthcare",
  "3825": "Healthcare", "3826": "Healthcare",
  "1311": "Energy",    "1381": "Energy",    "1382": "Energy",    "4911": "Utilities",
  "4931": "Utilities", "4941": "Utilities",
  "6020": "Financials","6021": "Financials","6022": "Financials","6199": "Financials",
  "6211": "Financials","6282": "Financials","6159": "Financials",
  "5000": "Consumer",  "5900": "Consumer",  "5600": "Consumer",  "5700": "Consumer",
  "5912": "Consumer",  "5411": "Consumer",
  "3559": "Industrials","3562": "Industrials","3490": "Industrials",
  "3812": "Industrials","3761": "Industrials",
  "4813": "Media & Telecom","4899": "Media & Telecom","7812": "Media & Telecom",
  "6512": "Real Estate","6552": "Real Estate","6726": "Real Estate",
};

// ── XML helpers ───────────────────────────────────────────────────────────────

function extractTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#[0-9]+;/g, "").trim();
}

interface ParsedEntry {
  companyName:     string;
  cik:             string;
  filingDate:      string;
  accessionNumber: string;
}

function parseAtomFeed(xml: string): ParsedEntry[] {
  const entries = extractTags(xml, "entry");
  const results: ParsedEntry[] = [];

  for (const entry of entries) {
    const titles = extractTags(entry, "title");
    const rawTitle = stripHtml(titles[0] ?? "");

    // Title format: "S-1 - Company Name (0001234567) (0001234567) - 2024-01-15"
    // or: "S-1/A - Company Name (0001234567)"
    const titleMatch = rawTitle.match(/S-1(?:\/A)?\s+-\s+(.+?)\s+\((\d{10})\)/i);
    if (!titleMatch) continue;

    const companyName = titleMatch[1].trim();
    const cik         = titleMatch[2];

    // Filing date from <updated> or <summary>
    const updatedTags = extractTags(entry, "updated");
    const filingDate  = (updatedTags[0] ?? "").substring(0, 10);

    // Accession number from id or link
    const idTags  = extractTags(entry, "id");
    const idText  = idTags[0] ?? "";
    const accMatch = idText.match(/(\d{10}-\d{2}-\d{6})/);
    const accessionNumber = accMatch ? accMatch[1] : "";

    results.push({ companyName, cik, filingDate, accessionNumber });
  }

  return results;
}

// ── EDGAR submissions enrichment ──────────────────────────────────────────────

async function enrichWithSIC(cik: string): Promise<{ sic: string | null; sicDescription: string | null; stateOfIncorp: string | null }> {
  try {
    const padded = cik.padStart(10, "0");
    const res    = await fetch(`https://data.sec.gov/submissions/CIK${padded}.json`, {
      headers: { "User-Agent": UA },
      signal:  AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { sic: null, sicDescription: null, stateOfIncorp: null };
    const json = await res.json() as { sic?: string; sicDescription?: string; stateOfIncorporation?: string };
    return {
      sic:           json.sic           ?? null,
      sicDescription: json.sicDescription ?? null,
      stateOfIncorp: json.stateOfIncorporation ?? null,
    };
  } catch {
    return { sic: null, sicDescription: null, stateOfIncorp: null };
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET() {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL) {
    return NextResponse.json(_cache.data);
  }

  const atomUrl = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=S-1&dateb=&owner=include&count=40&search_text=&output=atom";

  let xml: string;
  try {
    const res = await fetch(atomUrl, {
      headers: { "User-Agent": UA, "Accept": "application/atom+xml, application/xml, text/xml" },
      signal:  AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`[ipo-pipeline] EDGAR atom feed returned ${res.status}`);
      return NextResponse.json(_cache?.data ?? [], { status: res.ok ? 200 : 502 });
    }
    xml = await res.text();
  } catch (err) {
    console.error("[ipo-pipeline] fetch failed:", err);
    return NextResponse.json(_cache?.data ?? [], { status: 502 });
  }

  const parsed = parseAtomFeed(xml).slice(0, 30);
  console.log(`[ipo-pipeline] parsed ${parsed.length} S-1 entries`);

  // Enrich first 15 with SIC data (parallel, capped to avoid rate limiting)
  const toEnrich = parsed.slice(0, 15);
  const enriched = await Promise.all(
    toEnrich.map(async (entry) => {
      const { sic, sicDescription, stateOfIncorp } = await enrichWithSIC(entry.cik);
      return {
        ...entry,
        sic,
        sicDescription,
        stateOfIncorp,
        sector: sic ? (SIC_SECTOR[sic] ?? null) : null,
      };
    }),
  );

  // Remaining entries without enrichment
  const rest: IPOFiler[] = parsed.slice(15).map(e => ({
    ...e, sic: null, sicDescription: null, stateOfIncorp: null, sector: null,
  }));

  const filers: IPOFiler[] = [...enriched, ...rest];
  _cache = { data: filers, fetchedAt: Date.now() };

  console.log(`[ipo-pipeline] returning ${filers.length} filers, ${enriched.length} enriched`);
  return NextResponse.json(filers);
}
