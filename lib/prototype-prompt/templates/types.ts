export interface PromptTemplate {
  toolName: string;
  /** إرشادات خاصة بالأداة تُحقن داخل الـ Prompt المرسل لـ AI */
  toolGuidance: string;
}
