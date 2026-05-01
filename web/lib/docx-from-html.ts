import HTMLtoDOCX from "html-to-docx";

/**
 * Strip heavy tags and wrap body for html-to-docx (no remote assets; styles removed).
 */
export function sanitizeHostedHtmlForDocx(fullHtml: string): string {
  const noScriptStyle = fullHtml
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");
  const body = noScriptStyle.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const inner =
    body?.[1]?.trim() ??
    noScriptStyle.replace(/^[\s\S]*?<html[^>]*>/i, "").replace(/<\/html>[\s\S]*$/i, "");
  return `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><meta charset="UTF-8" /></head>
<body>${inner}</body>
</html>`;
}

export async function hostedHtmlToDocxBuffer(html: string): Promise<Buffer> {
  const out = await HTMLtoDOCX(sanitizeHostedHtmlForDocx(html), null, {
    orientation: "portrait",
    title: "ApplyPanda tailored document",
    creator: "ApplyPanda",
    font: "Arial",
  });
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}
