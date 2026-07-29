import { describe, expect, it } from "vitest";
import { sanitizeInternalRedirect } from "../safeRedirect";

describe("sanitizeInternalRedirect — rejects open-redirect escapes (issue 1)", () => {
  const malicious: [string, string][] = [
    ["protocol-relative //", "//evil.example"],
    ["backslash escape", "/\\evil.example"],
    ["encoded backslash upper", "/%5Cevil.example"],
    ["encoded backslash lower", "/%5cevil.example"],
    ["encoded forward slash", "/%2Fevil.example"],
    ["mixed encoded slash+backslash", "/%2F%5Cevil.example"],
    ["double encoded backslash then path", "/%5c%5cevil.example"],
    ["absolute http", "http://evil.com/x"],
    ["absolute https", "https://evil.com/x"],
    ["protocol-relative bare", "//evil.com"],
    ["javascript url", "javascript:alert(1)"],
    ["malformed percent", "/%zz"],
    ["lone percent", "/%"],
    // Dot-segment normalization escapes (raw + encoded).
    ["raw dot-slash", "/.//evil.example"],
    ["raw dotdot-slash", "/..//evil.example"],
    ["encoded dot", "/%2e//evil.example"],
    ["encoded dotdot", "/%2e%2e//evil.example"],
    ["dot + encoded slash", "/.%2f/evil.example"],
    ["dotdot + encoded slash", "/..%2f/evil.example"],
    ["encoded dot upper", "/%2E//evil.example"],
    ["mixed encoded dot/slash", "/%2e%2f/evil.example"],
    ["dot then encoded backslash", "/.%5c/evil.example"],
    ["backslash mid-path", "/foo\\bar"],
    ["tab control char", "/foo\tbar"],
    ["newline control char", "/foo\nbar"],
    ["nul control char", "/foo\u0000bar"],
    ["not a path (relative)", "feed"],
    ["empty", ""],
  ];

  for (const [label, input] of malicious) {
    it(`rejects ${label} → "/"`, () => {
      expect(sanitizeInternalRedirect(input)).toBe("/");
    });
  }

  it("rejects null/undefined → /", () => {
    expect(sanitizeInternalRedirect(null)).toBe("/");
    expect(sanitizeInternalRedirect(undefined)).toBe("/");
  });
});

describe("sanitizeInternalRedirect — accepts valid same-origin paths", () => {
  const valid = ["/", "/feed", "/industries", "/industries/technology", "/feed?focus=ai", "/saved#item-1"];

  it("root → /", () => expect(sanitizeInternalRedirect("/")).toBe("/"));
  it("/feed → /feed", () => expect(sanitizeInternalRedirect("/feed")).toBe("/feed"));
  it("/industries → /industries", () => expect(sanitizeInternalRedirect("/industries")).toBe("/industries"));
  it("/industries/technology stays", () =>
    expect(sanitizeInternalRedirect("/industries/technology")).toBe("/industries/technology"));
  it("/feed?focus=ai keeps the query", () =>
    expect(sanitizeInternalRedirect("/feed?focus=ai")).toBe("/feed?focus=ai"));
  it("/saved#item-1 keeps the fragment", () =>
    expect(sanitizeInternalRedirect("/saved#item-1")).toBe("/saved#item-1"));

  it("never returns an external origin for any accepted input", () => {
    for (const input of valid) {
      const out = sanitizeInternalRedirect(input);
      expect(out.startsWith("/")).toBe(true);
      expect(out.startsWith("//")).toBe(false);
      expect(out.includes("\\")).toBe(false);
    }
  });
});
