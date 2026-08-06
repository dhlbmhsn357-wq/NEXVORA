import type { Locale } from "./config";

/**
 * قاموس الترجمة — مصدر واحد لكل النصوص المُترجَمة. مُنظَّم بـ namespaces
 * (nav / topbar / account / login / common …) عشان يكبر بسهولة. المرحلة ١
 * بتغطّي الواجهة الأساسية؛ نضيف namespaces جديدة للشاشات لاحقًا.
 *
 * الاستخدام: t("nav.overview") — المفتاح بصيغة "namespace.key".
 */

export type Dictionary = Record<string, string>;

const ar: Dictionary = {
  // عام
  "common.save": "حفظ",
  "common.cancel": "إلغاء",
  "common.search": "بحث",
  "common.loading": "جارٍ التحميل…",
  "common.language": "اللغة",

  // التنقّل (نفس عناصر nav-config)
  "nav.overview": "نظرة عامة",
  "nav.executive": "غرفة القيادة",
  "nav.group.workspace": "مساحة العمل",
  "nav.leads": "العملاء المحتملون",
  "nav.clients": "العملاء",
  "nav.projects": "المشاريع",
  "nav.workspace": "مساحتي",
  "nav.tasks": "المهام",
  "nav.collaboration": "التعاون",
  "nav.group.intelligence": "الذكاء والأتمتة",
  "nav.organizationalIntelligence": "الذكاء التنظيمي",
  "nav.automations": "الأتمتة",
  "nav.group.setup": "الإعداد",
  "nav.templates": "قوالب الاكتشاف",
  "nav.settings": "الإعدادات",
  "nav.help": "دليل الاستخدام",

  // درج الموبايل + التوب-بار
  "topbar.openMenu": "فتح القائمة",
  "topbar.closeMenu": "إغلاق القائمة",
  "topbar.menu": "القائمة",
  "topbar.searchMenu": "ابحث في القائمة…",
  "topbar.noResults": "لا توجد نتائج مطابقة",
  "topbar.account": "الحساب",
  "topbar.logout": "تسجيل الخروج",
  "topbar.loggingOut": "جاري تسجيل الخروج…",
  "topbar.subtitle": "PM Operating System",

  // الشريط الجانبي (ديسكتوب)
  "sidebar.pinned": "المثبّتة",
  "sidebar.recent": "الأخيرة",
  "sidebar.searchHint": "للبحث السريع",
  "sidebar.collapse": "طيّ الشريط الجانبي",
  "sidebar.expand": "توسيع الشريط الجانبي",

  // تسجيل الدخول
  "login.subtitle": "العقل المركزي لإدارة دورة حياة مشاريع VELORA",
  "login.title": "تسجيل الدخول",
  "login.internalOnly": "منصة داخلية لموظفي VELORA فقط.",
  "login.email": "بريدك الإلكتروني",
  "login.password": "كلمة المرور",
  "login.submit": "تسجيل الدخول",
  "login.forgot": "نسيت كلمة المرور؟",

  // الحساب
  "account.title": "الحساب",
  "account.subtitle": "إدارة ملفك الشخصي: الاسم، الصورة، البريد، كلمة المرور، والجلسات.",
  "account.profile": "الملف الشخصي",
  "account.fullName": "الاسم الكامل",
  "account.saveName": "حفظ الاسم",
  "account.changeAvatar": "تغيير الصورة",
  "account.password": "كلمة المرور",
  "account.currentPassword": "كلمة المرور الحالية",
  "account.newPassword": "كلمة المرور الجديدة",
  "account.confirmPassword": "تأكيد كلمة المرور الجديدة",
  "account.passwordHint": "10 أحرف على الأقل، وتحتوي حرفًا كبيرًا وصغيرًا ورقمًا.",
  "account.changePassword": "تغيير كلمة المرور",
  "account.email": "البريد الإلكتروني",
  "account.currentEmail": "الحالي",
  "account.newEmail": "البريد الجديد",
  "account.confirmWithPassword": "كلمة المرور الحالية للتأكيد",
  "account.changeEmail": "تغيير البريد",
  "account.sessions": "الجلسات والأجهزة",
  "account.sessionsHint": "لو دخلت من جهاز مش بتاعك، تقدر تنهي كل الجلسات الأخرى مع الاحتفاظ بجلستك الحالية.",
  "account.endOtherSessions": "إنهاء الجلسات الأخرى",
};

const en: Dictionary = {
  // common
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.search": "Search",
  "common.loading": "Loading…",
  "common.language": "Language",

  // navigation (mirrors nav-config)
  "nav.overview": "Overview",
  "nav.executive": "Command Center",
  "nav.group.workspace": "Workspace",
  "nav.leads": "Leads",
  "nav.clients": "Clients",
  "nav.projects": "Projects",
  "nav.workspace": "My Workspace",
  "nav.tasks": "Tasks",
  "nav.collaboration": "Collaboration",
  "nav.group.intelligence": "Intelligence & Automation",
  "nav.organizationalIntelligence": "Organizational Intelligence",
  "nav.automations": "Automations",
  "nav.group.setup": "Setup",
  "nav.templates": "Discovery Templates",
  "nav.settings": "Settings",
  "nav.help": "User Guide",

  // mobile drawer + topbar
  "topbar.openMenu": "Open menu",
  "topbar.closeMenu": "Close menu",
  "topbar.menu": "Menu",
  "topbar.searchMenu": "Search the menu…",
  "topbar.noResults": "No matching results",
  "topbar.account": "Account",
  "topbar.logout": "Sign out",
  "topbar.loggingOut": "Signing out…",
  "topbar.subtitle": "PM Operating System",

  // sidebar (desktop)
  "sidebar.pinned": "Pinned",
  "sidebar.recent": "Recent",
  "sidebar.searchHint": "for quick search",
  "sidebar.collapse": "Collapse sidebar",
  "sidebar.expand": "Expand sidebar",

  // login
  "login.subtitle": "The central brain for managing VELORA's project lifecycle",
  "login.title": "Sign in",
  "login.internalOnly": "Internal platform for VELORA staff only.",
  "login.email": "Your email",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.forgot": "Forgot your password?",

  // account
  "account.title": "Account",
  "account.subtitle": "Manage your profile: name, photo, email, password, and sessions.",
  "account.profile": "Profile",
  "account.fullName": "Full name",
  "account.saveName": "Save name",
  "account.changeAvatar": "Change photo",
  "account.password": "Password",
  "account.currentPassword": "Current password",
  "account.newPassword": "New password",
  "account.confirmPassword": "Confirm new password",
  "account.passwordHint": "At least 10 characters, including uppercase, lowercase, and a digit.",
  "account.changePassword": "Change password",
  "account.email": "Email",
  "account.currentEmail": "Current",
  "account.newEmail": "New email",
  "account.confirmWithPassword": "Current password to confirm",
  "account.changeEmail": "Change email",
  "account.sessions": "Sessions & devices",
  "account.sessionsHint": "If you signed in from a device that isn't yours, you can end all other sessions while keeping your current one.",
  "account.endOtherSessions": "End other sessions",
};

const DICTIONARIES: Record<Locale, Dictionary> = { ar, en };

/** يرجّع قاموس اللغة كامل (يُمرَّر للعميل عبر LocaleProvider). */
export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES.ar;
}

/** ترجمة مفتاح واحد مع fallback (المفتاح نفسه لو مش موجود). */
export function translate(dict: Dictionary, key: string): string {
  return dict[key] ?? key;
}
