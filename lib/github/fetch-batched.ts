import type { GitHubClient } from "./client";
import type { RepoFile } from "./repo-reader";

/**
 * جلب محتوى مجموعة ملفات على دفعات متوازية (بدل طلب واحد ورا التاني
 * بالتسلسل) مع احترام حد أقصى لعدد الملفات وحجم المحتوى الإجمالي —
 * منطق مشترك بين readRepository (قراءة كاملة) وreadRepositoryDiff
 * (قراءة تدريجية)، بدل ما يتكرر في الملفين.
 */
export async function fetchFilesBatched(
  client: GitHubClient,
  owner: string,
  repo: string,
  sha: string,
  paths: string[],
  options: { maxFiles: number; budgetChars: number; concurrency: number }
): Promise<RepoFile[]> {
  const files: RepoFile[] = [];
  let budgetUsed = 0;

  for (let i = 0; i < paths.length; i += options.concurrency) {
    if (files.length >= options.maxFiles || budgetUsed >= options.budgetChars) break;

    const batch = paths.slice(i, i + options.concurrency);
    const batchResults = await Promise.all(
      batch.map(async (path) => ({ path, content: await client.getFileContent(owner, repo, path, sha) }))
    );

    for (const { path, content } of batchResults) {
      if (!content) continue;
      if (files.length >= options.maxFiles || budgetUsed >= options.budgetChars) break;

      const remaining = options.budgetChars - budgetUsed;
      const trimmedContent = content.length > remaining ? content.slice(0, remaining) : content;

      files.push({ path, content: trimmedContent });
      budgetUsed += trimmedContent.length;
    }
  }

  return files;
}
