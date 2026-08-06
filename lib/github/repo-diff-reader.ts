import { GitHubClient, parseRepoUrl, type GitHubTreeEntry } from "./client";
import { isRelevantPath } from "./file-filters";
import { fetchFilesBatched } from "./fetch-batched";
import type { RepoFile } from "./repo-reader";

const CONTENT_BUDGET_CHARS = 150_000;
const MAX_FILES = 80;
const FETCH_CONCURRENCY = 10;

export interface RepoDiffResult {
  headSha: string;
  /** true لو مفيش Commit سابق نقارن بيه (أول مراجعة) أو المقارنة فشلت
   * (مثلاً بعد Force Push/Rebase محا الـ Commit القديم من التاريخ) —
   * في الحالتين لازم تحليل كامل بدل تدريجي. */
  isFullAnalysis: boolean;
  /** كل مسارات الملفات القابلة للمراجعة في الـ Commit الحالي — خفيفة
   * (أسماء بس، من غير محتوى)، تُستخدم كسياق بنيوي كامل لمحور
   * Architecture (اللي محتاج يشوف شكل المشروع كله مش بس اللي اتغيّر). */
  fileTree: string[];
  /** محتوى الملفات المُضافة/المُعدَّلة فقط (أو كل الملفات لو isFullAnalysis). */
  changedFiles: RepoFile[];
  /** مسارات مُضافة حديثًا (جزء من changedFiles) — للتفرقة في File Explorer بين "جديد" و"معدَّل". */
  addedPaths: string[];
  /** مسارات اتشالت من الـ Repo من وقت المراجعة السابقة — أي Findings مرتبطة بيها لازم تتشال برضه. */
  removedPaths: string[];
  totalFilesInRepo: number;
}

/**
 * قارئ Repository تدريجي — بيرجع بس الملفات اللي اتغيّرت من آخر مراجعة
 * (باستخدام GitHub Compare API) بدل إعادة قراءة الـ Repo كله في كل مرة.
 * ده أساس الـ Incremental Analysis في Static Architecture Review Engine.
 */
export async function readRepositoryDiff(
  repoUrl: string,
  ref: string,
  token: string,
  baseSha: string | null
): Promise<RepoDiffResult> {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    throw new Error("رابط الـ Repository غير صالح. المتوقع رابط GitHub زي https://github.com/owner/repo");
  }

  const client = new GitHubClient(token);
  const branchOrRef = ref.trim() || (await client.getDefaultBranch(parsed.owner, parsed.repo));
  const headSha = await client.resolveRefToSha(parsed.owner, parsed.repo, branchOrRef);

  const tree = await client.getTree(parsed.owner, parsed.repo, headSha);
  const relevantPaths = tree.filter((e: GitHubTreeEntry) => isRelevantPath(e.path)).map((e) => e.path);

  if (!baseSha) {
    const changedFiles = await fetchFilesBatched(client, parsed.owner, parsed.repo, headSha, relevantPaths, {
      maxFiles: MAX_FILES,
      budgetChars: CONTENT_BUDGET_CHARS,
      concurrency: FETCH_CONCURRENCY,
    });
    return { headSha, isFullAnalysis: true, fileTree: relevantPaths, changedFiles, addedPaths: relevantPaths, removedPaths: [], totalFilesInRepo: tree.length };
  }

  if (baseSha === headSha) {
    return { headSha, isFullAnalysis: false, fileTree: relevantPaths, changedFiles: [], addedPaths: [], removedPaths: [], totalFilesInRepo: tree.length };
  }

  let compare;
  try {
    compare = await client.compareCommits(parsed.owner, parsed.repo, baseSha, headSha);
  } catch {
    // فشل المقارنة (غالبًا الـ Commit القديم مش موجود في التاريخ) — نرجع
    // لتحليل كامل بدل ما نفشل المراجعة كلها.
    const changedFiles = await fetchFilesBatched(client, parsed.owner, parsed.repo, headSha, relevantPaths, {
      maxFiles: MAX_FILES,
      budgetChars: CONTENT_BUDGET_CHARS,
      concurrency: FETCH_CONCURRENCY,
    });
    return { headSha, isFullAnalysis: true, fileTree: relevantPaths, changedFiles, addedPaths: relevantPaths, removedPaths: [], totalFilesInRepo: tree.length };
  }

  const relevantChanges = compare.files.filter((f) => isRelevantPath(f.filename));
  const toFetch = relevantChanges.filter((f) => f.status !== "removed").map((f) => f.filename);
  const addedPaths = relevantChanges.filter((f) => f.status === "added").map((f) => f.filename);
  const removedPaths = relevantChanges.filter((f) => f.status === "removed").map((f) => f.filename);

  const changedFiles = await fetchFilesBatched(client, parsed.owner, parsed.repo, headSha, toFetch, {
    maxFiles: MAX_FILES,
    budgetChars: CONTENT_BUDGET_CHARS,
    concurrency: FETCH_CONCURRENCY,
  });

  return {
    headSha,
    isFullAnalysis: false,
    fileTree: relevantPaths,
    changedFiles,
    addedPaths,
    removedPaths,
    totalFilesInRepo: tree.length,
  };
}
