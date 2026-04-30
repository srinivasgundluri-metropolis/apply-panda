#!/usr/bin/env node
/**
 * add-to-scan.mjs — Append jobs to data/scan-history.tsv (and optionally pipeline.md)
 *
 * Used by the chat assistant when the user says "save these to my scan list"
 * or "track these LinkedIn results". Preserves the existing scan-history.tsv
 * schema (url, first_seen, portal, title, company, status). Skips duplicates
 * by URL — the same job already on disk is never re-added.
 *
 * USAGE
 *
 * 1. Single job via flags:
 *      node add-to-scan.mjs \
 *        --url "https://www.linkedin.com/jobs/view/4405024733" \
 *        --company "University of Chicago" \
 *        --title "Microbiome Quality Control Associate" \
 *        [--portal linkedin] [--also-pipeline]
 *
 * 2. Batch from stdin (JSON):
 *      node scrape-linkedin.mjs --keywords X --location Y | node add-to-scan.mjs --from-stdin
 *
 *    Stdin shape: either the scrape-linkedin.mjs output `{ results: [...] }`
 *    OR a bare array `[ { url, company, title, ... } ]`.
 *
 * OPTIONS
 *   --portal NAME       Source label (default "linkedin").
 *   --also-pipeline     Also append a checkbox row to data/pipeline.md.
 *   --pretty            Pretty-print the JSON summary.
 *   --help              Show help.
 *
 * OUTPUT
 *   JSON summary to stdout:
 *     { added: N, skipped_duplicates: N, total: N, added_jobs: [...] }
 *
 * NOTES
 *   - Does NOT trigger evaluation. After running this, jobs appear on the
 *     dashboard's "Scan Results" page where the user can click Evaluate.
 *   - Status column is set to "added" — same convention as scan.mjs.
 */

import {
  readFileSync,
  writeFileSync,
  appendFileSync,
  existsSync,
  mkdirSync,
} from 'fs';
import { argv, exit, stdin, stdout, stderr } from 'process';

const SCAN_HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';
const HEADER = 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus';

// ── CLI parsing ─────────────────────────────────────────────────────

const args = argv.slice(2);

function getArg(name, def = null) {
  const i = args.indexOf(`--${name}`);
  if (i !== -1 && args[i + 1] !== undefined) return args[i + 1];
  return def;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

if (hasFlag('help') || hasFlag('h') || args.length === 0) {
  console.log(`
Append jobs to data/scan-history.tsv

Single job:
  node add-to-scan.mjs --url URL --company "Company" --title "Title" [--portal linkedin]

Batch from stdin:
  node scrape-linkedin.mjs --keywords X --location Y | node add-to-scan.mjs --from-stdin

Options:
  --url URL           Job URL (single mode)
  --company NAME      Company name (single mode)
  --title TITLE       Job title (single mode)
  --portal NAME       Source label (default "linkedin")
  --from-stdin        Read JSON from stdin instead of flags
  --also-pipeline     Also append to data/pipeline.md inbox
  --pretty            Pretty-print JSON output
  --help              Show this help
`.trim());
  exit(0);
}

const portal = (getArg('portal', 'linkedin') || 'linkedin').trim();
const alsoPipeline = hasFlag('also-pipeline');
const pretty = hasFlag('pretty');
const fromStdin = hasFlag('from-stdin');

// ── Helpers ─────────────────────────────────────────────────────────

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function loadSeenUrls() {
  const seen = new Set();
  if (!existsSync(SCAN_HISTORY_PATH)) return seen;
  const lines = readFileSync(SCAN_HISTORY_PATH, 'utf-8').split('\n');
  for (const line of lines.slice(1)) {
    const url = line.split('\t')[0];
    if (url) seen.add(url);
  }
  return seen;
}

function loadPipelineUrls() {
  const seen = new Set();
  if (!existsSync(PIPELINE_PATH)) return seen;
  const text = readFileSync(PIPELINE_PATH, 'utf-8');
  const re = /^- \[[ x]\][^h]*?(https?:\/\/[^\s|]+)/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    seen.add(m[1]);
  }
  return seen;
}

function ensureScanHistory() {
  mkdirSync('data', { recursive: true });
  if (!existsSync(SCAN_HISTORY_PATH)) {
    writeFileSync(SCAN_HISTORY_PATH, HEADER + '\n', 'utf-8');
  }
}

function sanitizeForTsv(s) {
  // TSV is fragile — strip tabs, newlines, and carriage returns from each
  // field so a single bad title can't corrupt the table.
  return String(s || '').replace(/[\t\r\n]+/g, ' ').trim();
}

function appendScanRows(rows) {
  if (rows.length === 0) return;
  const lines =
    rows
      .map(
        (r) =>
          `${sanitizeForTsv(r.url)}\t${sanitizeForTsv(r.first_seen)}\t${sanitizeForTsv(
            r.portal,
          )}\t${sanitizeForTsv(r.title)}\t${sanitizeForTsv(r.company)}\tadded`,
      )
      .join('\n') + '\n';
  appendFileSync(SCAN_HISTORY_PATH, lines, 'utf-8');
}

function ensurePipelineHeader() {
  if (existsSync(PIPELINE_PATH)) return;
  mkdirSync('data', { recursive: true });
  writeFileSync(
    PIPELINE_PATH,
    '# Pipeline Inbox\n\n## Pendientes\n\n## Procesadas\n\n',
    'utf-8',
  );
}

function appendPipelineRows(rows) {
  if (rows.length === 0) return;
  ensurePipelineHeader();
  const text = readFileSync(PIPELINE_PATH, 'utf-8');
  const lines = text.split('\n');

  // Insert after the "## Pendientes" heading + blank line.
  let insertAt = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Pendientes/i.test(lines[i])) {
      insertAt = i + 1;
      // Skip the blank line that usually follows.
      if (lines[insertAt] === '') insertAt += 1;
      break;
    }
  }
  if (insertAt === -1) {
    // No Pendientes heading — append new block at the end.
    const newBlock =
      '\n## Pendientes\n\n' +
      rows.map((r) => `- [ ] ${r.url} | ${r.company} | ${r.title}`).join('\n') +
      '\n';
    appendFileSync(PIPELINE_PATH, newBlock, 'utf-8');
    return;
  }
  const newRows = rows.map(
    (r) => `- [ ] ${r.url} | ${r.company} | ${r.title}`,
  );
  lines.splice(insertAt, 0, ...newRows);
  writeFileSync(PIPELINE_PATH, lines.join('\n'), 'utf-8');
}

// ── Input gathering ─────────────────────────────────────────────────

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = '';
    stdin.setEncoding('utf-8');
    stdin.on('data', (chunk) => {
      buf += chunk;
    });
    stdin.on('end', () => resolve(buf));
    stdin.on('error', reject);
  });
}

function normalizeJobs(input) {
  let data = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch (e) {
      throw new Error(`Invalid JSON on stdin: ${e.message}`);
    }
  }
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.results)) return data.results;
  throw new Error(
    'Unexpected JSON shape — expected an array or `{ results: [...] }`.',
  );
}

async function gatherJobs() {
  if (fromStdin) {
    const raw = await readStdin();
    return normalizeJobs(raw);
  }
  const url = (getArg('url') || '').trim();
  const company = (getArg('company') || '').trim();
  const title = (getArg('title') || '').trim();
  if (!url || !company || !title) {
    throw new Error(
      'Single mode requires --url, --company, and --title (or use --from-stdin).',
    );
  }
  return [{ url, company, title }];
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  ensureScanHistory();

  const incoming = await gatherJobs();
  const seenUrls = loadSeenUrls();
  const pipelineUrls = alsoPipeline ? loadPipelineUrls() : new Set();
  const today = todayIso();

  const toAddScan = [];
  const toAddPipeline = [];
  let skipped = 0;

  for (const job of incoming) {
    const url = (job.url || '').trim();
    if (!url) continue;
    if (seenUrls.has(url)) {
      skipped += 1;
      continue;
    }
    const row = {
      url,
      first_seen: today,
      portal: job.portal || job.source || portal,
      title: (job.title || '').trim(),
      company: (job.company || '').trim(),
    };
    if (!row.title || !row.company) {
      skipped += 1;
      continue;
    }
    toAddScan.push(row);
    seenUrls.add(url);
    if (alsoPipeline && !pipelineUrls.has(url)) {
      toAddPipeline.push(row);
      pipelineUrls.add(url);
    }
  }

  appendScanRows(toAddScan);
  if (alsoPipeline) appendPipelineRows(toAddPipeline);

  const summary = {
    added: toAddScan.length,
    skipped_duplicates: skipped,
    total: incoming.length,
    also_pipeline: alsoPipeline ? toAddPipeline.length : 0,
    added_jobs: toAddScan.map((r) => ({
      url: r.url,
      company: r.company,
      title: r.title,
      portal: r.portal,
    })),
  };
  stdout.write(JSON.stringify(summary, null, pretty ? 2 : 0) + '\n');
}

main().catch((err) => {
  stderr.write(`Error: ${err.message}\n`);
  exit(1);
});
