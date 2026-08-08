/**
 * Prototype Studio — Codex Build Pack Builder
 * ===========================================
 * يجمع النسخة النهائية اللي هترتفع لـ Codex:
 *   • Approved Build Brief (من ChatGPT)
 *   • Latest Context Pack
 *   • Engineering Constitution (ثابت، غير قابل للتعديل)
 *   • Codex Starter Prompt (إشارة موجزة أن الملفات هي source-of-truth)
 *
 * الإخراج:
 *   • markdown مُجمّع كنص واحد (للنسخ السريع)
 *   • zipBuffer عبر jszip (dynamic import) يحتوي 4 ملفات منفصلة
 */
import { CODE_WRITING_STANDARDS_HEADING, CODE_WRITING_STANDARDS_BODY } from "@/lib/prototype-prompt/code-standards";
import { getLatest } from "./artifact-service";

const CODEX_STARTER_PROMPT = `# Codex Starter Instructions

You are extending an existing project. The following files are your **source of truth** — read them in order before writing any code:

1. \`00-engineering-constitution.md\` — mandatory quality rules (non-negotiable, applies to every file).
2. \`01-context-pack.md\` — full product context assembled deterministically from NEXVORA.
3. \`02-build-brief.md\` — human-approved brief from ChatGPT discussion (this is what to build).

## Working style
- Ship in small, self-contained stages. Do not scaffold the entire app at once.
- After each stage: pause, summarize what you did, list what is still pending, and wait for confirmation.
- Any ambiguity → ask, do not guess.
- Never invent scope beyond what is in the build brief.
`;

export interface CodexPackResult {
  markdown: string;
  files: { name: string; content: string }[];
  approvedBriefId: string | null;
  approvedBriefVersion: number | null;
  contextPackId: string | null;
  contextPackVersion: number | null;
}

export async function buildCodexPack(projectId: string): Promise<CodexPackResult> {
  const approvedBrief = await getLatest(projectId, "build_brief", ["approved"]);
  if (!approvedBrief) {
    throw new Error("لا يوجد Build Brief معتمد. يجب اعتماد نسخة أولًا.");
  }
  const contextPack = await getLatest(projectId, "context_pack", ["active", "approved"]);
  if (!contextPack) {
    throw new Error("لا يوجد Context Pack مُولّد. عُد لخطوة 4 (نقاش ChatGPT) وأنشئ Context Pack أوّلًا.");
  }

  const constitution = `# ${CODE_WRITING_STANDARDS_HEADING}\n\n${CODE_WRITING_STANDARDS_BODY}\n`;
  const briefHeader = `# Build Brief (Approved v${approvedBrief.version})\n\n_Approved at ${approvedBrief.approvedAt ?? "—"}._\n\n---\n\n`;
  const contextHeader = `# Context Pack (v${contextPack.version})\n\n_Generated at ${contextPack.createdAt}._\n\n---\n\n`;

  const files: CodexPackResult["files"] = [
    { name: "00-engineering-constitution.md", content: constitution },
    { name: "01-context-pack.md", content: contextHeader + contextPack.contentMd },
    { name: "02-build-brief.md", content: briefHeader + approvedBrief.contentMd },
    { name: "03-codex-starter.md", content: CODEX_STARTER_PROMPT },
  ];

  const markdown = files.map((f) => `<!-- ==== ${f.name} ==== -->\n\n${f.content}`).join("\n\n---\n\n");

  return {
    markdown,
    files,
    approvedBriefId: approvedBrief.id,
    approvedBriefVersion: approvedBrief.version,
    contextPackId: contextPack.id,
    contextPackVersion: contextPack.version,
  };
}

/** يجمّع الملفات في Zip base64 عبر dynamic import لـ jszip. */
export async function buildCodexPackZipBase64(projectId: string): Promise<{ base64: string; filename: string }> {
  const pack = await buildCodexPack(projectId);
  const JSZipModule = await import("jszip");
  const JSZip = JSZipModule.default;
  const zip = new JSZip();
  for (const f of pack.files) zip.file(f.name, f.content);
  const base64 = await zip.generateAsync({ type: "base64" });
  const filename = `codex-build-pack-v${pack.approvedBriefVersion ?? 0}.zip`;
  return { base64, filename };
}

export { CODEX_STARTER_PROMPT };
