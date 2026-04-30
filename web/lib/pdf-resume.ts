/**
 * Résumé PDF text extraction for the dashboard coach flow (server-only).
 */

/** Hard cap aligned with typical one–two page résumés. */
export const MAX_RESUME_PDF_BYTES = 5 * 1024 * 1024;

/** Characters passed into the coach model after extraction (model also gets existing cv/profile). */
const MAX_EXTRACTED_CHARS = 60_000;

type PdfParser = {
  getText: () => Promise<{ text?: string }>;
  destroy: () => Promise<void> | void;
};

type PdfJsTextContent = { items: unknown[] };
type PdfJsPage = { getTextContent: () => Promise<PdfJsTextContent> };
type PdfJsDocument = { numPages: number; getPage: (n: number) => Promise<PdfJsPage> };
type PdfJsModule = {
  getDocument?: (args: { data: Uint8Array }) => {
    promise: Promise<PdfJsDocument>;
    destroy: () => Promise<void> | void;
  };
  default?: {
    getDocument?: (args: { data: Uint8Array }) => {
      promise: Promise<PdfJsDocument>;
      destroy: () => Promise<void> | void;
    };
  };
};

async function createPdfParser(buffer: Buffer): Promise<PdfParser> {
  const data = new Uint8Array(buffer);
  const mod = (await import("pdf-parse")) as {
    PDFParse: new (args: { data: Uint8Array }) => PdfParser;
  };
  return new mod.PDFParse({ data });
}

async function extractTextWithPdfJs(buffer: Buffer): Promise<string> {
  const candidates = [
    "pdfjs-dist/legacy/build/pdf.mjs",
    "pdfjs-dist/build/pdf.mjs",
    "pdfjs-dist/legacy/build/pdf.js",
    "pdfjs-dist/build/pdf.js",
  ];
  let getDocument:
    | ((args: { data: Uint8Array }) => {
        promise: Promise<PdfJsDocument>;
        destroy: () => Promise<void> | void;
      })
    | null = null;
  for (const specifier of candidates) {
    try {
      const mod = (await import(specifier)) as PdfJsModule;
      getDocument = mod.getDocument ?? mod.default?.getDocument ?? null;
      if (getDocument) break;
    } catch {
      // Try next candidate path.
    }
  }
  if (!getDocument) {
    throw new Error("PDF.js loader is unavailable in this runtime.");
  }
  const loadingTask = getDocument({ data: new Uint8Array(buffer) });
  const pdf = (await loadingTask.promise) as PdfJsDocument;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it: unknown) =>
        typeof it === "object" && it !== null && "str" in it
          ? String((it as { str?: unknown }).str ?? "")
          : "",
      )
      .join(" ")
      .trim();
    if (line) pages.push(line);
  }
  await loadingTask.destroy();
  return pages.join("\n\n").trim();
}

function extractTextHeuristicFromPdf(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const matches = raw.match(/\((?:\\.|[^\\()]){3,}\)/g) ?? [];
  const cleaned = matches
    .map((m) =>
      m
        .slice(1, -1)
        .replace(/\\n/g, " ")
        .replace(/\\r/g, " ")
        .replace(/\\t/g, " ")
        .replace(/\\\(/g, "(")
        .replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((s) => s.length >= 3 && /[A-Za-z]/.test(s));
  const unique = Array.from(new Set(cleaned));
  return unique.join("\n").trim();
}

function normalizePdfErrorMessage(error: unknown): Error {
  const message =
    error instanceof Error ? error.message : String(error ?? "PDF parsing failed.");
  if (message.toLowerCase().includes("did not match the expected pattern")) {
    return new Error(
      "PDF parser failed in this runtime. Please export the PDF again as a text PDF (not print/image PDF), or paste resume text directly.",
    );
  }
  if (message.toLowerCase().includes("dommatrix is not defined")) {
    return new Error(
      "PDF fallback parser hit a runtime dependency issue (DOMMatrix). Please retry upload; a heuristic text-extraction fallback is now applied automatically.",
    );
  }
  return error instanceof Error ? error : new Error(message);
}

export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_RESUME_PDF_BYTES) {
    throw new Error(
      `Résumé PDF is too large (max ${MAX_RESUME_PDF_BYTES / (1024 * 1024)}MB).`,
    );
  }
  if (buffer.length === 0) {
    throw new Error("Empty PDF file.");
  }

  let parser: PdfParser | null = null;
  try {
    parser = await createPdfParser(buffer);
    let text = "";
    try {
      const result: { text?: string } = await parser.getText();
      text = (result.text ?? "").replace(/\u0000/g, "").trim();
    } catch {
      // Fallback parser path for PDFs rejected by pdf-parse in some runtimes.
      try {
        text = await extractTextWithPdfJs(buffer);
      } catch {
        // Last-resort extraction without PDF.js runtime dependencies.
        text = extractTextHeuristicFromPdf(buffer);
      }
    }
    if (!text) {
      throw new Error(
        "Could not extract text from this PDF. It may be image-only — try exporting as text PDF or OCR first.",
      );
    }
    return text.length > MAX_EXTRACTED_CHARS
      ? `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n_[Truncated after ${MAX_EXTRACTED_CHARS} characters]_`
      : text;
  } catch (e) {
    throw normalizePdfErrorMessage(e);
  } finally {
    if (parser) {
      try {
        await parser.destroy();
      } catch {
        // Ignore teardown failures so they do not mask root-cause parse errors.
      }
    }
  }
}
