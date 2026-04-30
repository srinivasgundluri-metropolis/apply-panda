/**
 * Résumé PDF text extraction for the dashboard coach flow (server-only).
 */

import { PDFParse } from "pdf-parse";

/** Hard cap aligned with typical one–two page résumés. */
export const MAX_RESUME_PDF_BYTES = 5 * 1024 * 1024;

/** Characters passed into the coach model after extraction (model also gets existing cv/profile). */
const MAX_EXTRACTED_CHARS = 60_000;

export async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_RESUME_PDF_BYTES) {
    throw new Error(
      `Résumé PDF is too large (max ${MAX_RESUME_PDF_BYTES / (1024 * 1024)}MB).`,
    );
  }
  if (buffer.length === 0) {
    throw new Error("Empty PDF file.");
  }

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    let result: { text?: string };
    try {
      result = await parser.getText();
    } catch (e) {
      const message = (e as Error).message || "PDF parsing failed.";
      if (message.includes("did not match the expected pattern")) {
        throw new Error(
          "PDF parser failed in this runtime. Please export the PDF again (text PDF) or paste resume text directly.",
        );
      }
      throw e;
    }
    const text = (result.text ?? "").replace(/\u0000/g, "").trim();
    if (!text) {
      throw new Error(
        "Could not extract text from this PDF. It may be image-only — try exporting as text PDF or OCR first.",
      );
    }
    return text.length > MAX_EXTRACTED_CHARS
      ? `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n_[Truncated after ${MAX_EXTRACTED_CHARS} characters]_`
      : text;
  } finally {
    await parser.destroy();
  }
}
