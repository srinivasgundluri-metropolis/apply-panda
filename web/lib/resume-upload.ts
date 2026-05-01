import mammoth from "mammoth";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function isSupportedResumeUpload(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx") ||
    file.type === "text/markdown" ||
    file.type === "text/plain" ||
    name.endsWith(".md") ||
    name.endsWith(".txt")
  );
}

export async function extractTextFromResumeUpload(file: File): Promise<string> {
  if (file.size === 0) throw new Error("Empty upload file.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Upload too large (max 10MB).");
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) {
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await mammoth.extractRawText({ buffer: buf });
    return (result.value ?? "").replace(/\u0000/g, "").trim();
  }
  return (await file.text()).replace(/\u0000/g, "").trim();
}

export function toResumeMarkdown(extractedText: string, filename: string): string {
  return [
    `# Imported Resume (${filename})`,
    "",
    "> Auto-generated from uploaded DOCX/Markdown. Review and edit as needed.",
    "",
    extractedText.trim(),
  ].join("\n");
}
