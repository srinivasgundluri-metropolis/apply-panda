import HTMLtoDOCX from "html-to-docx";

/** Stanford CES style: serif body ≥11pt equivalents, margins no smaller than 1 inch */
const STANFORD_DOCX_DOCUMENT_OPTIONS = {
  orientation: "portrait" as const,
  title: "Résumé",
  creator: "ApplyPanda",
  font: "Times New Roman",
  /** Half-points → 22 = 11pt (library default; matches CES “no smaller than 10pt”). */
  fontSize: 22,
  margins: {
    top: "1in",
    right: "1in",
    bottom: "1in",
    left: "1in",
  },
};

/**
 * Prepare model HTML for html-to-docx: strip scripts only (keep `<style>` so serif/margins
 * from prompts carry into DOCX); no remote assets.
 */
export function sanitizeHostedHtmlForDocx(fullHtml: string): string {
  const stripped = fullHtml.replace(/<script[\s\S]*?<\/script>/gi, "");
  const body = stripped.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const inner =
    body?.[1]?.trim() ??
    stripped.replace(/^[\s\S]*?<html[^>]*>/i, "").replace(/<\/html>[\s\S]*$/i, "");
  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8" /></head>
<body>${inner}</body>
</html>`;
}

export async function hostedHtmlToDocxBuffer(
  html: string,
  options?: { variant?: "cv" | "cl" },
): Promise<Buffer> {
  const variant = options?.variant ?? "cv";
  const title = variant === "cl" ? "Cover letter" : "Résumé";
  const out = await HTMLtoDOCX(sanitizeHostedHtmlForDocx(html), null, {
    ...STANFORD_DOCX_DOCUMENT_OPTIONS,
    title,
    description: `${title} · Stanford chronological layout (DOCX baseline)`,
  });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
