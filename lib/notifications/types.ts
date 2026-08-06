/**
 * العقد الموحّد لطبقة Notification Channel — أي قناة جديدة (WhatsApp،
 * Email، Slack، ...) لازم تطبّق NotificationChannel وترجّع نفس الشكل
 * بالظبط. نفس فلسفة AIProvider بالظبط، لسهولة إضافة قنوات لاحقًا
 * بملف واحد + سطر تسجيل، بدون لمس أي منطق موجود.
 */
export interface EscalationNotification {
  projectName: string;
  customerIdentifier: string | null;
  requestType: string;
  summary: string;
}

export interface NotificationSendResult {
  ok: boolean;
  error?: string;
}

export interface NotificationChannel {
  readonly name: string;
  send(notification: EscalationNotification): Promise<NotificationSendResult>;
}
