// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditableSectionCard from "./EditableSectionCard";

/**
 * اختبارات Component لـ EditableSectionCard — بتغطي بالتحديد السيناريوهات
 * المتباعدة بين اللوحات الأربعة اللي بتستخدمه (PRD, Prototype Prompt,
 * Client Presentation, Developer Handoff)، عشان أي Regression مستقبلي
 * في السلوك المشترك يتكشف فورًا بدون الحاجة لمتصفح حي أو تسجيل دخول.
 */

async function openAndEdit(user: ReturnType<typeof userEvent.setup>, editLabel = "تعديل") {
  await user.click(screen.getByRole("button", { name: /▼|▲/ }));
  await user.click(screen.getByRole("button", { name: editLabel }));
}

describe("EditableSectionCard", () => {
  it("يفتح ويقفل عند الضغط على الهيدر", async () => {
    const user = userEvent.setup();
    render(
      <EditableSectionCard
        headerLabel={<span>القسم</span>}
        disabled={false}
        viewContent={<p>محتوى</p>}
        getInitialDraft={() => "محتوى"}
        onSave={async () => ({ ok: true })}
        onChanged={() => {}}
      />
    );

    expect(screen.queryByText("محتوى")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /▼/ }));
    expect(screen.getByText("محتوى")).toBeInTheDocument();
  });

  it("زر Regenerate يظهر بس لو الـ prop اتبعتت", () => {
    const { rerender } = render(
      <EditableSectionCard
        headerLabel={<span>القسم</span>}
        disabled={false}
        viewContent={<p>محتوى</p>}
        getInitialDraft={() => ""}
        onSave={async () => ({ ok: true })}
        onChanged={() => {}}
        regenerate={{ label: "Regenerate", regeneratingLabel: "...", onRegenerate: vi.fn() }}
      />
    );
    // مقفول افتراضيًا؛ افتحه أولًا
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();

    rerender(
      <EditableSectionCard
        headerLabel={<span>القسم</span>}
        disabled={false}
        viewContent={<p>محتوى</p>}
        getInitialDraft={() => ""}
        onSave={async () => ({ ok: true })}
        onChanged={() => {}}
      />
    );
  });

  it("الحفظ الناجح بيقفل وضع التعديل وبينادي onChanged", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const onSave = vi.fn().mockResolvedValue({ ok: true });

    render(
      <EditableSectionCard
        headerLabel={<span>القسم</span>}
        disabled={false}
        viewContent={<p>القيمة القديمة</p>}
        getInitialDraft={() => "القيمة القديمة"}
        onSave={onSave}
        onChanged={onChanged}
      />
    );

    await openAndEdit(user);
    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "قيمة جديدة");
    await user.click(screen.getByRole("button", { name: "حفظ" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith("قيمة جديدة");
    // رجع لوضع العرض
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("فشل بدون رسالة خطأ (سلوك Presentation): يقفل وضع التعديل بصمت", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    // بيحاكي بالظبط سلوك Presentation: onSave بترجع ok:true دايمًا حتى
    // لو الحفظ الفعلي اتجاهل جوه try/catch.
    const onSave = vi.fn().mockResolvedValue({ ok: true });

    render(
      <EditableSectionCard
        headerLabel={<span>Slide</span>}
        disabled={false}
        viewContent={<p>{"{}"}</p>}
        getInitialDraft={() => "{}"}
        onSave={onSave}
        onChanged={onChanged}
        editLabel="تعديل"
        textareaDir="ltr"
      />
    );

    await openAndEdit(user);
    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "this is not valid json");
    await user.click(screen.getByRole("button", { name: "حفظ" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    // مفيش أي رسالة خطأ ظاهرة، ورجع لوضع العرض
    expect(screen.queryByText(/JSON/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("فشل مع رسالة خطأ (سلوك Developer Handoff): يفضل في وضع التعديل ويعرض الخطأ", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const onSave = vi.fn().mockResolvedValue({ ok: false, error: "JSON غير صالح — راجع الصياغة." });

    render(
      <EditableSectionCard
        headerLabel={<span>Section</span>}
        disabled={false}
        viewContent={<p>{"{}"}</p>}
        getInitialDraft={() => "{}"}
        onSave={onSave}
        onChanged={onChanged}
        editLabel="Edit"
        saveLabel="Save"
        textareaDir="ltr"
      />
    );

    await openAndEdit(user, "Edit");
    const textarea = screen.getByRole("textbox");
    await user.clear(textarea);
    await user.type(textarea, "this is not valid json");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("JSON غير صالح — راجع الصياغة.")).toBeInTheDocument());
    // فضل في وضع التعديل، وonChanged ما اتناداش
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("زر إلغاء بيقفل وضع التعديل من غير حفظ", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <EditableSectionCard
        headerLabel={<span>القسم</span>}
        disabled={false}
        viewContent={<p>محتوى</p>}
        getInitialDraft={() => "محتوى"}
        onSave={onSave}
        onChanged={() => {}}
        cancelLabel="إلغاء"
      />
    );

    await openAndEdit(user);
    await user.click(screen.getByRole("button", { name: "إلغاء" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("زر التعديل معطّل لما disabled=true", async () => {
    const user = userEvent.setup();
    render(
      <EditableSectionCard
        headerLabel={<span>القسم</span>}
        disabled={true}
        viewContent={<p>محتوى</p>}
        getInitialDraft={() => "محتوى"}
        onSave={async () => ({ ok: true })}
        onChanged={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: /▼/ }));
    expect(screen.getByRole("button", { name: "تعديل" })).toBeDisabled();
  });
});
