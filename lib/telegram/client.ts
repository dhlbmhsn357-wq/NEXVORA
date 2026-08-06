/**
 * طبقة Telegram Integration — كل التعامل الخام مع Telegram Bot API
 * محصور هنا بس. لا يوجد منطق أعمال في الملف ده.
 */
export class TelegramClient {
  private readonly apiBase: string;

  constructor(private readonly token: string) {
    this.apiBase = `https://api.telegram.org/bot${token}`;
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    await fetch(`${this.apiBase}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  }

  private async getFilePath(fileId: string): Promise<string> {
    const res = await fetch(`${this.apiBase}/getFile?file_id=${fileId}`);
    const body = (await res.json()) as {
      ok: boolean;
      description?: string;
      result?: { file_path?: string; file_size?: number };
    };
    if (!body.ok || !body.result?.file_path) {
      throw new Error(
        `تعذّر الحصول على مسار الملف من Telegram: ${body.description ?? "سبب غير معروف"}`
      );
    }
    return body.result.file_path;
  }

  async downloadFile(fileId: string): Promise<ArrayBuffer> {
    const filePath = await this.getFilePath(fileId);
    const res = await fetch(`https://api.telegram.org/file/bot${this.token}/${filePath}`);
    if (!res.ok) {
      throw new Error(`فشل تحميل الملف من Telegram: HTTP ${res.status}`);
    }
    return res.arrayBuffer();
  }
}
