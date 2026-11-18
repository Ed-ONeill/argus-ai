// Fail on every high/critical tooling advisory, without an allowlist.
// The separate production dependency audit remains mandatory.
import { execFileSync } from "node:child_process";
let raw;
try { raw = process.platform === "win32"
  ? execFileSync("cmd.exe", ["/d", "/s", "/c", "npm audit --json"], { encoding: "utf8" })
  : execFileSync("npm", ["audit", "--json"], { encoding: "utf8" }); }
catch (error) { raw = error.stdout; }
if (!raw) throw new Error("Dependency audit did not produce a report");
const report = JSON.parse(raw);
if (!report.metadata || report.error) throw new Error("Dependency audit failed");
const advisories = Object.values(report.vulnerabilities ?? {}).flatMap(v => v.via ?? [])
  .filter(v => typeof v === "object" && ["high", "critical"].includes(v.severity));
if (advisories.length) {
  console.error(advisories.map(v => `${v.name}: ${v.url}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("No high/critical tooling advisories; exemptions: none.");
}
