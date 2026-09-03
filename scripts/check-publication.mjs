import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const listed = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" }
).split("\0").filter(Boolean);

const forbiddenFile = /(^|\/)(\.env(?:\.|$)|credentials[^/]*\.json$|secrets?[^/]*\.json$)|\.(csv|tsv|xls|xlsx|ods|pem|key|p12|pfx)$/i;
const emailPattern = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@([A-Z0-9.-]+\.[A-Z]{2,})/gi;
const allowedEmailDomain = /^(?:example\.(?:com|test|invalid)|users\.noreply\.github\.com)$/i;
const allowedCommitNames = new Set(["Cat Maniacs Maintainer", "GitHub", "github-actions[bot]"]);
const contentRules = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["absolute home-directory path", /(?:\/home\/[^/\s]+|\/Users\/[^/\s]+|[A-Z]:\\Users\\[^\\\s]+)/i],
  ["GitHub token", /\b(?:gh[opsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{30,}\b/],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/]
];

const findings = new Set();

for (const path of listed) {
  if (forbiddenFile.test(path)) findings.add(`${path}: sensitive file type or name`);
  let stats;
  try {
    stats = statSync(path);
  } catch {
    continue;
  }
  if (!stats.isFile() || stats.size > 5_000_000) continue;
  const buffer = readFileSync(path);
  if (buffer.includes(0)) continue;
  const source = buffer.toString("utf8");
  // npm may copy public maintainer contacts into deprecation notices in its generated lockfile.
  if (path !== "package-lock.json") {
    for (const match of source.matchAll(emailPattern)) {
      if (!allowedEmailDomain.test(match[1])) findings.add(`${path}: non-example email address`);
    }
  }
  for (const [label, pattern] of contentRules) {
    if (pattern.test(source)) findings.add(`${path}: ${label}`);
  }
}

const commitRows = execFileSync("git", ["log", "HEAD", "--format=%an%x09%ae%x09%cn%x09%ce"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);
for (const row of commitRows) {
  const [authorName, authorEmail, committerName, committerEmail] = row.split("\t");
  for (const name of [authorName, committerName]) {
    if (!allowedCommitNames.has(name)) findings.add("Git history: personal commit name");
  }
  for (const email of [authorEmail, committerEmail]) {
    const domain = email.slice(email.lastIndexOf("@") + 1);
    if (!allowedEmailDomain.test(domain) && !domain.endsWith(".invalid")) {
      findings.add("Git history: personal commit email address");
    }
  }
}

if (findings.size > 0) {
  console.error("Publication privacy check failed:");
  for (const finding of [...findings].sort()) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`Publication privacy check passed (${listed.length} candidate files, ${commitRows.length} commits).`);
