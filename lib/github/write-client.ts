const GITHUB_API_BASE = "https://api.github.com";

export interface CommittedFileChange {
  path: string;
  action: "create" | "update" | "delete";
}

/**
 * طبقة كتابة GitHub منفصلة عمدًا عن GitHubClient (lib/github/client.ts)
 * — ده موثّق صراحةً كـ Read-Only "دايمًا"، ومستخدم في محركات المراجعة
 * (Static/Security/Database/...) اللي المفروض متلمسش الـ Repo أبدًا.
 * الكتابة استخدام حصري لمحرك AI Code Execution Engine (Claude ينفّذ
 * كود فعليًا) — فصلها في كلاس/ملف مستقل يخلّي أي كود بيستورد
 * GitHubClient يفضل عنده ضمان Read-Only حقيقي، مش مجرد تسمية.
 *
 * بتستخدم GitHub Contents API مباشرة (PUT/DELETE على .../contents/{path})
 * — بدون git clone أو أي عملية Git محلية، نفس فلسفة GitHubClient
 * (REST API بس) عشان تشتغل في بيئة Serverless بدون Filesystem دائم.
 */
export class GitHubWriteClient {
  constructor(private readonly token: string) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  /** SHA الملف الحالي (لو موجود) — لازم لأي Update/Delete عبر Contents API. null لو الملف مش موجود (يبقى Create). */
  async getExistingFileSha(owner: string, repo: string, path: string, branch: string): Promise<string | null> {
    const res = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
      { headers: this.headers() }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { sha?: string };
    return body.sha ?? null;
  }

  /**
   * ينشئ الملف لو مش موجود، أو يحدّثه لو موجود (بيجيب الـ SHA تلقائيًا).
   * كل نداء = Commit واحد مباشر على الـ Branch — مفيش Pull Request هنا،
   * القرار ده موثّق في التقرير الختامي (راجع lib/claude-exec/task-executor.ts).
   */
  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    contentUtf8: string,
    commitMessage: string,
    branch: string
  ): Promise<{ commitSha: string | null }> {
    const existingSha = await this.getExistingFileSha(owner, repo, path, branch);
    const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
      method: "PUT",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify({
        message: commitMessage,
        content: Buffer.from(contentUtf8, "utf-8").toString("base64"),
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`فشل كتابة الملف "${path}" (HTTP ${res.status}): ${body.slice(0, 300)}`);
    }
    const result = (await res.json()) as { commit?: { sha?: string } };
    return { commitSha: result.commit?.sha ?? null };
  }

  async deleteFile(owner: string, repo: string, path: string, commitMessage: string, branch: string): Promise<void> {
    const existingSha = await this.getExistingFileSha(owner, repo, path, branch);
    if (!existingSha) return; // الملف مش موجود أصلًا — لا حاجة نمسحه.
    const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
      method: "DELETE",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify({ message: commitMessage, sha: existingSha, branch }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`فشل حذف الملف "${path}" (HTTP ${res.status}): ${body.slice(0, 300)}`);
    }
  }
}
