/**
 * Prototype Studio — Codex Build Pack Builder
 * ===========================================
 * يجمع النسخة النهائية اللي هترتفع لـ Codex:
 *   • Prototype Constitution (ثابت، خاص بالبروتوتايبات، يسمح بـ mocks)
 *   • Build Brief (معتمَد من ChatGPT، أو مُوَلَّد آليًا من Studio config)
 *   • Latest Context Pack (يُبنى on-the-fly لو لا توجد نسخة محفوظة)
 *   • Codex Starter Prompt
 *
 * ملاحظات مهمّة:
 *   • كل ملف .md يبدأ بـ BOM (U+FEFF) عشان Windows apps تتعرّف عليه كـ UTF-8
 *     ولا تُظهر Arabic كـ mojibake (ط... إلخ).
 *   • ترتيب الملفات: constitution → build brief → context pack → starter.
 *     Build Brief أولى من Context Pack لأنه هو المصدر الملزِم لِما يُبنى.
 */
import { getLatest } from "./artifact-service";
import { buildContextPackMarkdown } from "./context-pack-builder";
import { buildAutoBriefFromConfig } from "./auto-brief-builder";
import { getConfig } from "./config-service";
import {
  PROTOTYPE_CONSTITUTION_HEADING,
  PROTOTYPE_CONSTITUTION_BODY,
} from "./prototype-constitution";

/** UTF-8 BOM — يضمن قراءة صحيحة للعربية على Windows. */
const BOM = "﻿";

const CODEX_STARTER_PROMPT = `# Codex Instructions

You are extending an existing project as a coding agent.

## Source of truth (read in order)
1. \`00-prototype-constitution.md\` — quality rules for prototype code
2. \`01-build-brief.md\` — WHAT to build (this WINS on any conflict)
3. \`02-context-pack.md\` — product context (background only)

## Rules
- This is a **PROTOTYPE**, not production. Use mocks, in-memory data, and stubs freely.
- **Build Brief wins** any conflict with Context Pack (scope, features, priorities).
- Ship **Phase 1 (the 5 core flows) fully**, then stop and summarize. Do NOT build all 26 screens upfront.
- Do NOT invent features not in the Build Brief.
- Do NOT ask for clarification on minor points — use reasonable defaults matching the design direction.
- Do NOT build: real payment gateways, real integrations (WhatsApp/Zoom/etc.), authentication systems, backend databases, deployment infrastructure — UNLESS the Build Brief explicitly requires them.
- Arabic RTL first; English second.

## Working style
- Ship in 2 phases:
  - **Phase 1:** foundation (routes/design tokens/nav) + the core flows listed in Brief §Core Flows. Full working screens, no skeletons.
  - **Phase 2:** secondary screens as simple stubs. Ship after Phase 1 is reviewed.
- After Phase 1: summarize what shipped, what's stubbed, next steps. Wait for approval before Phase 2.
- No "TODO" comments left in code.
`;

export type BriefSourceInPack = "approved" | "auto";

export interface CodexPackResult {
  markdown: string;
  files: { name: string; content: string }[];
  approvedBriefId: string | null;
  approvedBriefVersion: number | null;
  contextPackId: string | null;
  contextPackVersion: number | null;
  briefSource: BriefSourceInPack;
}

export async function buildCodexPack(projectId: string): Promise<CodexPackResult> {
  const approvedBrief = await getLatest(projectId, "build_brief", ["approved"]);
  const contextPackArtifact = await getLatest(projectId, "context_pack", ["active", "approved"]);

  // Context Pack: fallback to on-the-fly build if none persisted yet
  let contextPackContent: string;
  let contextPackId: string | null;
  let contextPackVersion: number | null;
  let contextGeneratedAt: string;
  if (contextPackArtifact) {
    contextPackContent = contextPackArtifact.contentMd;
    contextPackId = contextPackArtifact.id;
    contextPackVersion = contextPackArtifact.version;
    contextGeneratedAt = contextPackArtifact.createdAt;
  } else {
    const built = await buildContextPackMarkdown(projectId);
    contextPackContent = built.md;
    contextPackId = null;
    contextPackVersion = null;
    contextGeneratedAt = new Date().toISOString();
  }

  // Build Brief: fallback to auto-generated from Studio config if none approved
  let briefContent: string;
  let briefSource: BriefSourceInPack;
  let briefHeader: string;
  if (approvedBrief) {
    briefContent = approvedBrief.contentMd;
    briefSource = "approved";
    briefHeader = `# Build Brief (Approved v${approvedBrief.version})\n\n_Approved at ${approvedBrief.approvedAt ?? "—"}._\n\n---\n\n`;
  } else {
    const cfg = await getConfig(projectId);
    briefContent = buildAutoBriefFromConfig(cfg);
    briefSource = "auto";
    briefHeader = `# Build Brief (Auto-Generated from Studio Config)\n\n_⚠ لم يتم اعتماد Brief من ChatGPT — استُخدم fallback من الإعدادات._\n\n---\n\n`;
  }

  const constitution = `# ${PROTOTYPE_CONSTITUTION_HEADING}\n\n${PROTOTYPE_CONSTITUTION_BODY}\n`;
  const contextHeader = `# Context Pack${contextPackVersion !== null ? ` (v${contextPackVersion})` : " (on-the-fly)"}\n\n_Generated at ${contextGeneratedAt}._\n\n---\n\n`;

  // Prepend UTF-8 BOM to every file so Windows apps render Arabic correctly.
  const files: CodexPackResult["files"] = [
    { name: "00-prototype-constitution.md", content: BOM + constitution },
    { name: "01-build-brief.md", content: BOM + briefHeader + briefContent },
    { name: "02-context-pack.md", content: BOM + contextHeader + contextPackContent },
    { name: "03-codex-starter.md", content: BOM + CODEX_STARTER_PROMPT },
  ];

  // Combined markdown preview also carries a BOM up-front.
  const markdown =
    BOM +
    files
      .map((f) => `<!-- ==== ${f.name} ==== -->\n\n${f.content.replace(/^﻿/, "")}`)
      .join("\n\n---\n\n");

  return {
    markdown,
    files,
    approvedBriefId: approvedBrief?.id ?? null,
    approvedBriefVersion: approvedBrief?.version ?? null,
    contextPackId,
    contextPackVersion,
    briefSource,
  };
}

/** يجمّع الملفات في Zip base64 عبر dynamic import لـ jszip. */
export async function buildCodexPackZipBase64(
  projectId: string,
): Promise<{ base64: string; filename: string; briefSource: BriefSourceInPack }> {
  const pack = await buildCodexPack(projectId);
  const JSZipModule = await import("jszip");
  const JSZip = JSZipModule.default;
  const zip = new JSZip();
  for (const f of pack.files) zip.file(f.name, f.content);
  const base64 = await zip.generateAsync({ type: "base64" });
  const versionTag = pack.approvedBriefVersion !== null
    ? `v${pack.approvedBriefVersion}`
    : "auto";
  const filename = `codex-build-pack-${versionTag}.zip`;
  return { base64, filename, briefSource: pack.briefSource };
}

export { CODEX_STARTER_PROMPT };
