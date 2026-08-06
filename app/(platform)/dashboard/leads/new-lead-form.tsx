"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { DiscoveryFormTemplate } from "@/lib/types/database";

export default function NewLeadForm({ templates }: { templates: DiscoveryFormTemplate[] }) {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [source, setSource] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 1) إنشاء العميل (Client) إذا تم إدخال اسم شركة
    let clientId: string | null = null;
    if (companyName.trim()) {
      const { data: client, error: clientErr } = await supabase
        .from("clients")
        .insert({ company_name: companyName.trim() })
        .select("id")
        .single();
      if (clientErr) {
        setError(clientErr.message);
        setSaving(false);
        return;
      }
      clientId = client.id;
    }

    // 2) إنشاء جهة الاتصال إذا تم إدخال اسم
    let contactId: string | null = null;
    if (contactName.trim() && clientId) {
      const { data: contact, error: contactErr } = await supabase
        .from("contacts")
        .insert({
          client_id: clientId,
          full_name: contactName.trim(),
          whatsapp: whatsapp.trim() || null,
        })
        .select("id")
        .single();
      if (contactErr) {
        setError(contactErr.message);
        setSaving(false);
        return;
      }
      contactId = contact.id;
    }

    // 3) إنشاء الـ Lead نفسه
    const { error: leadErr } = await supabase.from("leads").insert({
      client_id: clientId,
      contact_id: contactId,
      source: source.trim() || null,
      discovery_template_id: templateId || null,
      owner_id: user?.id ?? null,
    });

    if (leadErr) {
      setError(leadErr.message);
      setSaving(false);
      return;
    }

    setCompanyName("");
    setContactName("");
    setWhatsapp("");
    setSource("");
    setTemplateId("");
    setSaving(false);
    router.refresh();
  }

  return (
    <Card padding="md">
      <form onSubmit={handleSubmit} className="h-fit space-y-3">
        <p className="text-sm font-semibold text-[var(--v-text)]">إضافة عميل محتمل جديد</p>

        <Input placeholder="اسم الشركة" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        <Input placeholder="اسم الشخص المسؤول" value={contactName} onChange={(e) => setContactName(e.target.value)} />
        <Input placeholder="رقم واتساب" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
        <Input placeholder="مصدر العميل (واتساب، إحالة...)" value={source} onChange={(e) => setSource(e.target.value)} />

        <div>
          <label className="mb-1 block text-xs text-[var(--v-text-muted)]">نوع المشروع (قالب الاكتشاف)</label>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="h-10 w-full rounded-[var(--v-radius-md)] border border-[var(--v-border)] bg-[var(--v-bg)] px-3 text-sm text-[var(--v-text)] outline-none focus:border-[var(--v-primary)]"
          >
            <option value="">— اختياري، يتحدد لاحقًا —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-xs text-[var(--v-red)]">{error}</p>}

        <Button type="submit" variant="primary" className="w-full" loading={saving}>
          إضافة
        </Button>
      </form>
    </Card>
  );
}
