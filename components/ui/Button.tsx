"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "success";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--v-primary)] text-white hover:bg-[var(--v-primary-hover)] border border-transparent",
  secondary:
    "bg-[var(--v-surface)] text-[var(--v-text)] hover:bg-[var(--v-surface-2)] border border-[var(--v-border)]",
  ghost:
    "bg-transparent text-[var(--v-text-secondary)] hover:bg-[var(--v-surface)] hover:text-[var(--v-text)] border border-transparent",
  outline:
    "bg-transparent text-[var(--v-text)] hover:border-[var(--v-primary)] hover:text-[var(--v-primary)] border border-[var(--v-border)]",
  danger:
    "bg-[var(--v-red)] text-white hover:opacity-90 border border-transparent",
  success:
    "bg-[var(--v-green)] text-white hover:opacity-90 border border-transparent",
};

// ارتفاعات ثابتة (32/40/48px) — Token المقاسات من استراتيجية الارتقاء
// (§12)، بدل ما الارتفاع يتغيّر حسب المحتوى بس.
const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-sm gap-2",
};

type ConflictingHandlers =
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
  | "children";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, ConflictingHandlers> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
  icon?: ReactNode;
}

/**
 * زر النظام الموحّد — نفس الأنماط دي كانت مكررة حرفيًا في 14+ ملف
 * قبل كده. أي شكل زر جديد لازم يتضاف هنا كـ Variant، مش كنسخة محلية.
 */
interface Ripple {
  id: number;
  x: number;
  y: number;
  size: number;
}

let rippleId = 0;

export default function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  icon,
  className = "",
  onClick,
  ...rest
}: ButtonProps) {
  const [ripples, setRipples] = useState<Ripple[]>([]);

  function handleClick(e: MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 1.6;
    const id = rippleId++;
    setRipples((prev) => [
      ...prev,
      { id, x: e.clientX - rect.left - size / 2, y: e.clientY - rect.top - size / 2, size },
    ]);
    setTimeout(() => setRipples((prev) => prev.filter((r) => r.id !== id)), 500);
    onClick?.(e);
  }

  return (
    <motion.button
      type={rest.type ?? "button"}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12 }}
      disabled={disabled || loading}
      onClick={handleClick}
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-[var(--v-radius-md)] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v-primary)] disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${
        variant === "primary" ? "font-bold" : ""
      } ${className}`}
      {...rest}
    >
      <AnimatePresence>
        {ripples.map((r) => (
          <motion.span
            key={r.id}
            initial={{ opacity: 0.35, scale: 0 }}
            animate={{ opacity: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="pointer-events-none absolute rounded-full bg-current"
            style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
          />
        ))}
      </AnimatePresence>
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon
      )}
      {children}
    </motion.button>
  );
}
