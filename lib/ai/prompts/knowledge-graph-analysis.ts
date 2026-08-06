/**
 * Prompt تحليل شبكة المعرفة عند الطلب — نداء AI واحد بيغطّي الفحوصات
 * اللي محتاجة حكم لغوي/دلالي (مصطلحات غير متسقة، تكرار بصياغة مختلفة)،
 * زائد اقتراح علاقات بين عناصر مالهاش أي علاقة مسجّلة لسه. الفحوصات
 * الحتمية (دورة اعتماد/تكرار مفتاح/علاقة يتيمة) بتتحسب بالكود في
 * lib/knowledge-graph/consistency-checker.ts، مش هنا.
 */
export function buildKnowledgeGraphAnalysisPrompt(
  nodes: { id: string; category: string; title: string; description: string }[],
  existingRelationPairs: string[]
): string {
  const nodesBlock = nodes.map((n) => `- [${n.id}] (${n.category}) ${n.title}${n.description ? ` — ${n.description}` : ""}`).join("\n");

  return `أنت محلل أعمال ومهندس معماري خبير بتراجع شبكة معرفة مشروع كامل.

## عناصر المعرفة (كل عنصر له ID فريد بين قوسين مربّعين)
${nodesBlock}

## أزواج العلاقات الموجودة بالفعل (from → to)، لا تكرّرها
${existingRelationPairs.length > 0 ? existingRelationPairs.join("\n") : "لا يوجد"}

## المطلوب منك بالضبط
أرجع **JSON فقط** بالشكل ده بالظبط، من غير أي شرح أو Markdown code fences:

{
  "terminology_issues": [
    { "description": "شرح التضارب أو عدم الاتساق في المصطلحات", "node_ids": ["ID1", "ID2"] }
  ],
  "semantic_duplicates": [
    { "description": "شرح ليه العنصرين نفس الفكرة بصياغة مختلفة", "node_ids": ["ID1", "ID2"] }
  ],
  "proposed_relations": [
    { "from_id": "ID موجود فعليًا فوق", "to_id": "ID موجود فعليًا فوق", "relation_type": "depends_on" | "related_to" | "blocks" | "part_of" | "conflicts_with" }
  ]
}

قواعد صارمة:
- استخدم فقط IDs المذكورة فعليًا في القائمة فوق — ممنوع اختراع IDs.
- proposed_relations: اقترح بس علاقات واضحة ومنطقية من النصوص المرفقة — لو مش متأكد، متقترحش. لا تكرر أي زوج موجود في "أزواج العلاقات الموجودة بالفعل" فوق.
- لو مفيش مشاكل مصطلحات أو تكرار دلالي، أرجع مصفوفات فاضية.
- كل النصوص بالعربية.`;
}
