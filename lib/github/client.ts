const GITHUB_API_BASE = "https://api.github.com";

export interface GitHubTreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
  sha: string;
}

/**
 * طبقة GitHub Integration الخام — كل نداء API مباشر لـ GitHub محصور
 * هنا بس. Read-Only دايمًا (مفيش أي عملية كتابة في الكلاس ده).
 */
export class GitHubClient {
  constructor(private readonly token: string) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`تعذّر الوصول للـ Repository (HTTP ${res.status}) — تأكد من الرابط والصلاحيات.`);
    }
    const body = (await res.json()) as { default_branch: string };
    return body.default_branch;
  }

  async resolveRefToSha(owner: string, repo: string, ref: string): Promise<string> {
    const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/commits/${ref}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`تعذّر إيجاد Branch أو Commit باسم "${ref}" (HTTP ${res.status}).`);
    }
    const body = (await res.json()) as { sha: string };
    return body.sha;
  }

  async getTree(owner: string, repo: string, sha: string): Promise<GitHubTreeEntry[]> {
    const res = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
      { headers: this.headers() }
    );
    if (!res.ok) {
      throw new Error(`تعذّر قراءة شجرة الملفات (HTTP ${res.status}).`);
    }
    const body = (await res.json()) as { tree: GitHubTreeEntry[]; truncated: boolean };
    return body.tree.filter((e) => e.type === "blob");
  }

  async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string | null> {
    const res = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${ref}`,
      { headers: { ...this.headers(), Accept: "application/vnd.github.raw+json" } }
    );
    if (!res.ok) return null;
    return res.text();
  }

  /**
   * فرق بين Commit قديم وجديد (GitHub Compare API) — أساس التحليل
   * التدريجي (Incremental): بدل ما نعيد قراءة الـ Repository كله في كل
   * مراجعة، نعرف بالظبط أي ملفات اتغيّرت. لو الـ Commit القديم بقى
   * مش موجود في التاريخ (Force Push/Rebase)، الـ API بترجع 404 —
   * الكولر لازم يتعامل معاها كـ "لازم Full Analysis من الأول".
   */
  async compareCommits(
    owner: string,
    repo: string,
    baseSha: string,
    headSha: string
  ): Promise<{ status: string; files: Array<{ filename: string; status: string; previous_filename?: string }> }> {
    const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/compare/${baseSha}...${headSha}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`تعذّر مقارنة الـ Commits (HTTP ${res.status}) — غالبًا الـ Commit القديم مش موجود في التاريخ.`);
    }
    const body = (await res.json()) as {
      status: string;
      files?: Array<{ filename: string; status: string; previous_filename?: string }>;
    };
    return { status: body.status, files: body.files ?? [] };
  }
}

/**
 * يستخرج owner/repo من رابط GitHub بأي صيغة شائعة.
 */
export function parseRepoUrl(repoUrl: string): { owner: string; repo: string } | null {
  const match = repoUrl
    .trim()
    .replace(/\.git$/, "")
    .match(/github\.com[/:]([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}
