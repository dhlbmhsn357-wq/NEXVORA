import { GitHubClient, parseRepoUrl, type GitHubTreeEntry } from "./client";
import { isRelevantPath } from "./file-filters";

/** أقصى حجم إجمالي للمحتوى المُرسل لـ AI (بالحروف) — يبقى جوه حدود Gemini المعقولة */
const CONTENT_BUDGET_CHARS = 150_000;
/** أقصى عدد ملفات نجيب محتواها (حماية إضافية من عدد طلبات GitHub API) */
const MAX_FILES = 80;
/** عدد الملفات اللي بنجيبها بالتوازي في كل دفعة — بدل طلب واحد ورا التاني
 * بالتسلسل (كان بياخد وقت طويل جدًا لـ Repository فيه عشرات الملفات،
 * وده كان بيدفع وقت التنفيذ الكلي فوق الحد المسموح للـ Background Job
 * قبل ما توليد الـ AI يبدأ أصلًا). 10 دفعة معقولة وبعيدة عن حدود
 * GitHub API الثانوية للتزامن. */
const FETCH_CONCURRENCY = 10;

export interface RepoFile {
  path: string;
  content: string;
}

export interface ReadRepoResult {
  resolvedSha: string;
  files: RepoFile[];
  totalFilesInRepo: number;
  filesIncluded: number;
}

/**
 * طبقة Repository Reader — مسؤولية واحدة: الاتصال بـ GitHub، تحديد
 * الـ Commit المطلوب، وجمع الملفات الأكثر ارتباطًا بالكود المصدري
 * (مش كل حاجة في الـ Repo) جوه حد أقصى معقول. صفر منطق مراجعة هنا.
 */
export async function readRepository(
  repoUrl: string,
  ref: string,
  token: string
): Promise<ReadRepoResult> {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    throw new Error("رابط الـ Repository غير صالح. المتوقع رابط GitHub زي https://github.com/owner/repo");
  }

  const client = new GitHubClient(token);
  const branchOrRef = ref.trim() || (await client.getDefaultBranch(parsed.owner, parsed.repo));
  const resolvedSha = await client.resolveRefToSha(parsed.owner, parsed.repo, branchOrRef);

  const tree = await client.getTree(parsed.owner, parsed.repo, resolvedSha);
  const relevantEntries = tree.filter((e: GitHubTreeEntry) => isRelevantPath(e.path));

  const files: RepoFile[] = [];
  let budgetUsed = 0;

  for (let i = 0; i < relevantEntries.length; i += FETCH_CONCURRENCY) {
    if (files.length >= MAX_FILES || budgetUsed >= CONTENT_BUDGET_CHARS) break;

    const batch = relevantEntries.slice(i, i + FETCH_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (entry) => ({
        path: entry.path,
        content: await client.getFileContent(parsed.owner, parsed.repo, entry.path, resolvedSha),
      }))
    );

    for (const { path, content } of batchResults) {
      if (!content) continue;
      if (files.length >= MAX_FILES || budgetUsed >= CONTENT_BUDGET_CHARS) break;

      const remaining = CONTENT_BUDGET_CHARS - budgetUsed;
      const trimmedContent = content.length > remaining ? content.slice(0, remaining) : content;

      files.push({ path, content: trimmedContent });
      budgetUsed += trimmedContent.length;
    }
  }

  return {
    resolvedSha,
    files,
    totalFilesInRepo: tree.length,
    filesIncluded: files.length,
  };
}
