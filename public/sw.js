// Service Worker VELORA — Network-first للصفحات (بمهلة و fallback
// لصفحة offline.html)، و Stale-While-Revalidate للأصول الثابتة، بدون أي
// تدخل في منطق الـ API أو البيانات.
//
// رقم النسخة لازم يتغيّر مع أي تعديل هنا: الـ activate بيمسح أي cache
// باسم مختلف، فتغيير الرقم هو اللي بيضمن إن القديم يتشال فعلًا.
const CACHE_VERSION = "velora-shell-v2";
const OFFLINE_URL = "/offline.html";
const SHELL_ASSETS = [OFFLINE_URL];

/**
 * مهلة طلب التنقّل.
 *
 * ده كان أخطر عيب في النسخة السابقة: التنقّل كان `fetch(request)` من
 * غير أي مهلة، و`.catch()` بيشتغل على الرفض بس — والطلب اللي بيعلّق
 * (خادم بطيء أو شبكة واقفة) مابيرفضش أبدًا. النتيجة إن الوعد مايكتملش،
 * والصفحة ماتترسمش، وشاشة بداية الـ PWA تفضل ظاهرة بلا نهاية.
 *
 * ١٥ ثانية سقف كريم للخادم البطيء، وبعدها صفحة "غير متصل" بزرار إعادة
 * محاولة — لأن شاشة بيضا واقفة أسوأ بكتير من رسالة واضحة.
 */
const NAVIGATION_TIMEOUT_MS = 15000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

/** طلب شبكة محدود بمهلة — بيرفض بدل ما يعلّق للأبد. */
function fetchWithTimeout(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error("timeout"));
    }, timeoutMs);

    fetch(request, { signal: controller.signal })
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

const CACHEABLE_DESTINATIONS = ["style", "script", "image", "font"];

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // ما نلمسش استدعاءات الـ API — لازم تفضل Network فقط عشان البيانات
  // تفضل حديثة ومطابقة لصلاحيات المستخدم الحقيقية.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetchWithTimeout(request, NAVIGATION_TIMEOUT_MS).catch(() =>
        caches.match(OFFLINE_URL).then((res) => res || Response.error())
      )
    );
    return;
  }

  // أي طلب مش أصل ثابت (fetch داخلي، prefetch، إلخ) بيعدّي للشبكة زي
  // ما هو — التدخّل فيه بلا فايدة وبيزوّد مساحة الخطأ.
  if (CACHEABLE_DESTINATIONS.indexOf(request.destination) === -1) return;

  // Stale-While-Revalidate: نرجّع المخزّن فورًا لو موجود، وفي نفس الوقت
  // نجيب نسخة جديدة للمرة الجاية. النسخة السابقة كانت بترجّع المخزّن
  // وخلاص بلا أي تحديث، فالأصل القديم كان بيفضل مخدوم للأبد.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => null);

      if (cached) return cached;

      // مفيش نسخة مخزّنة: نستنى الشبكة. لو فشلت نرجّع خطأ صريح بدل
      // `undefined` — النسخة السابقة كانت بترجّع المتغيّر الفاضي هنا،
      // و`respondWith(undefined)` بيتحوّل لخطأ شبكة غامض.
      return network.then((response) => response || Response.error());
    })
  );
});
