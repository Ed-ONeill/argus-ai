// Fail on new high/critical tooling advisories. One unpatched glob-parser
// advisory is contained to repository-controlled build patterns; no production
// dependency is exempt (the separate --omit=dev audit must be completely clean).
import { execFileSync } from "node:child_process";
let raw;
try { raw = process.platform === "win32"
  ? execFileSync("cmd.exe", ["/d", "/s", "/c", "npm audit --json"], { encoding: "utf8" })
  : execFileSync("npm", ["audit", "--json"], { encoding: "utf8" }); }
catch (error) { raw = error.stdout; }
if (!raw) throw new Error("Dependency audit did not produce a report");
const report = JSON.parse(raw);
if (!report.metadata || report.error) throw new Error("Dependency audit failed");
const known = "https://github.com/advisories/GHSA-fc5q-39xc-vjpf";
const advisories = Object.values(report.vulnerabilities ?? {}).flatMap(v => v.via ?? [])
  .filter(v => typeof v === "object" && ["high", "critical"].includes(v.severity));
const unexpected = advisories.filter(v => v.url !== known);
if (unexpected.length) {
  console.error(unexpected.map(v => `${v.name}: ${v.url}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(advisories.length ? "Known unpatched picomatch advisory remains in build tooling; production exemptions: none." : "No high/critical tooling advisories.");
}
