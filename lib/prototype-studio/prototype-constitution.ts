/**
 * Prototype Studio — Prototype Constitution
 * =========================================
 * دستور مخصّص لبروتوتايبات Studio. مختلف عن الدستور الهندسي في
 * `lib/prototype-prompt/code-standards.ts` (المُستخدم في Extended
 * Technical Delivery والذي يمنع mocks/prototype code). هنا نسمح
 * صراحةً بـ mocks + in-memory state + stubs — الهدف بروتوتايب
 * قابل للنقر يُظهر التجربة، ليس نظامًا إنتاجيًا.
 */
export const PROTOTYPE_CONSTITUTION_HEADING = "Prototype Constitution";

export const PROTOTYPE_CONSTITUTION_BODY = `These rules govern PROTOTYPE code only. Production-grade constraints (real auth, real DB, hardening) do NOT apply here. The goal is a clickable, usable prototype that demonstrates the experience — not a production system.

## 1. Prototype Freedoms (explicitly allowed)
- Mocks, stubs, and fixture data are welcome.
- In-memory state (React state, Zustand, plain JS objects) instead of a real backend.
- Simplified error handling (a toast + console.log is acceptable).
- No authentication systems — a fake current user is fine.
- No real integrations (payments, WhatsApp, Zoom, email, SMS) — stub the surface.

## 2. RTL Arabic First
- Every screen must render correctly in RTL. Use \`dir="rtl"\` at the root.
- Arabic labels are primary; English is secondary.
- Icons that imply direction (arrows, chevrons) must flip in RTL.
- Numbers, dates, and currency use Arabic locale formatting where sensible.

## 3. Design System Consistency
- Pick ONE design language (colors, typography, spacing, radius) and apply it everywhere.
- Reuse components — do not invent a new Button/Card/Input per screen.
- Respect the Design Direction section of the Build Brief (visual style, density, brand colors, typography).

## 4. State Coverage (every screen)
- Loading state (skeleton or spinner)
- Empty state (helpful message + primary action)
- Error state (friendly message + retry)
- Populated state (with realistic mock data, not "Lorem ipsum")

## 5. Accessibility Basics
- Semantic HTML (\`<button>\`, \`<nav>\`, \`<main>\`, headings in order).
- Keyboard navigation works for every interactive element.
- Visible focus states.
- Sufficient color contrast for text.
- Form inputs have associated labels.

## 6. Code Clarity
- Clear names — no \`data\`, \`temp\`, \`item\`. Prefer domain terms.
- Small components. If a component grows past ~150 lines, split it.
- No dead code, no commented-out blocks, no \`TODO:\` left behind.
- TypeScript for props; avoid \`any\`.

## 7. Scope Discipline
- Build only what the Build Brief lists. Do not invent features.
- If something is ambiguous, pick the simplest reasonable default that matches the design direction — do not stall to ask.
- Out-of-scope items in the Brief stay out. No stretch scope.

This is a prototype. Prioritize a smooth, coherent user experience over engineering perfection.`;
