#!/usr/bin/env node

/**
 * generate-cover-letter-pdf.mjs — Markdown cover letter → PDF via Playwright
 *
 * Usage:
 *   node generate-cover-letter-pdf.mjs <input.md> <output.pdf> [--format=letter|a4]
 *
 * Notes:
 * - This is a lightweight markdown renderer tailored for cover letters.
 * - It does NOT try to be fully CommonMark compliant.
 * - The PDF rendering is delegated to `generate-pdf.mjs` (HTML → PDF).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = argv.slice(2);
  let inputPath;
  let outputPath;
  let format = 'letter';

  for (const arg of args) {
    if (arg.startsWith('--format=')) format = arg.split('=')[1].toLowerCase();
    else if (!inputPath) inputPath = arg;
    else if (!outputPath) outputPath = arg;
  }

  if (!inputPath || !outputPath) {
    console.error('Usage: node generate-cover-letter-pdf.mjs <input.md> <output.pdf> [--format=letter|a4]');
    process.exit(1);
  }

  if (!['letter', 'a4'].includes(format)) {
    console.error(`Invalid format "${format}". Use: letter, a4`);
    process.exit(1);
  }

  return { inputPath: resolve(inputPath), outputPath: resolve(outputPath), format };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(text) {
  // Links: [text](url)
  let out = escapeHtml(text);
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_m, label, url) => {
    const safeUrl = escapeHtml(url);
    const safeLabel = escapeHtml(label);
    return `<a class="mono-url" href="${safeUrl}">${safeLabel}</a>`;
  });

  // Bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic: *text* (simple, avoid matching list markers)
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');

  return out;
}

function mdToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const html = paragraph
      .map((line) => {
        const hardBreak = / {2}$/.test(line);
        const clean = line.replace(/ {2}$/, '');
        return renderInline(clean) + (hardBreak ? '<br />' : '');
      })
      .join(' ');
    blocks.push(`<p>${html}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list || list.length === 0) return;
    const items = list.map(item => `<li>${renderInline(item)}</li>`).join('\n');
    blocks.push(`<ul>\n${items}\n</ul>`);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ').trimEnd();

    // Blank line separates blocks
    if (line.trim() === '') {
      flushList();
      flushParagraph();
      continue;
    }

    // Bullets (supports "-" or "•")
    const bulletMatch = line.match(/^(?:-|\u2022)\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      if (!list) list = [];
      list.push(bulletMatch[1]);
      continue;
    }

    // Default: paragraph line
    flushList();
    paragraph.push(line);
  }

  flushList();
  flushParagraph();

  return blocks.join('\n');
}

function main() {
  const { inputPath, outputPath, format } = parseArgs(process.argv);
  const md = readFileSync(inputPath, 'utf-8');

  const template = readFileSync(resolve(__dirname, 'templates/cover-letter-template.html'), 'utf-8');
  const pageWidth = format === 'letter' ? '8.5in' : '210mm';
  const body = mdToHtml(md);

  const html = template
    .replace(/\{\{LANG\}\}/g, 'en')
    .replace(/\{\{TITLE\}\}/g, 'Cover Letter')
    .replace(/\{\{PAGE_WIDTH\}\}/g, pageWidth)
    .replace('{{BODY}}', body);

  const tmpHtml = resolve('/tmp', `cover-letter-${Date.now()}.html`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(tmpHtml, html, 'utf-8');

  const res = spawnSync(
    process.execPath,
    [resolve(__dirname, 'generate-pdf.mjs'), tmpHtml, outputPath, `--format=${format}`],
    { stdio: 'inherit' }
  );
  process.exit(res.status ?? 1);
}

main();

