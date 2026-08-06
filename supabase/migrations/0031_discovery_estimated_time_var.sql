-- قالب دعوة الاكتشاف الافتراضي كان بيحطّ "8 إلى 12 دقيقة" كنص ثابت
-- داخل الرسالة، بينما صفحة الفورم نفسها بتحسب المدة ديناميكيًا حسب عدد
-- أسئلة القالب الفعلي — فالرقمين كانوا ممكن يختلفوا. استبدلنا الجزء
-- الثابت بمتغيّر {{estimated_time_line}} بيتحسب بنفس المعادلة بالظبط
-- وقت الإرسال (lib/discovery-templates/estimated-time.ts).
--
-- الـ WHERE هنا بيتأكد إن الصف لسه بنصه الافتراضي الأصلي قبل ما يلمسه —
-- لو الأدمن عدّل القالب يدويًا، التحديث ده مش هيمسّه خالص.

update public.whatsapp_templates
set
  body = replace(
    body,
    E'بيستغرق تقريباً 8 إلى 12 دقيقة، وتقدر تقف وترجع تكمّل في أي وقت من نفس الرابط.',
    E'{{estimated_time_line}}، وتقدر تقف وترجع تكمّل في أي وقت من نفس الرابط.'
  ),
  variables = '["customer_name","project_name","company_name","discovery_link","expiration_date","expiration_line","estimated_time_line"]'::jsonb
where key = 'discovery_invitation_default'
  and body like E'%بيستغرق تقريباً 8 إلى 12 دقيقة، وتقدر تقف وترجع تكمّل في أي وقت من نفس الرابط.%';
