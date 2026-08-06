"use client";

import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

export interface CardProps {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  hover?: boolean;
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
  id?: string;
  onClick?: () => void;
}

const paddingClasses = { none: "", sm: "p-4", md: "p-5", lg: "p-7" };

const luxuryEase = [0.25, 0.46, 0.45, 0.94] as const;

/**
 * الكارت الموحّد للنظام كله — نفس <code>rounded-xl border bg-[var(--v-bg)]</code>
 * كان مكرر حرفيًا في 38 موضع قبل كده. أي كارت جديد لازم يستخدم ده.
 */
export default function Card({
  children,
  padding = "md",
  hover = false,
  animate = true,
  className = "",
  ...rest
}: CardProps) {
  const motionProps = animate
    ? { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: luxuryEase } }
    : {};
  const hoverProps = hover ? { whileHover: { y: -4 } } : {};

  return (
    <motion.div
      className={`rounded-[var(--v-radius-xl)] border border-[var(--v-border)] bg-[var(--v-bg)] shadow-[var(--v-shadow-sm)] ${
        hover ? "transition-shadow duration-300 hover:shadow-[var(--v-shadow-md)]" : ""
      } ${paddingClasses[padding]} ${className}`}
      {...motionProps}
      {...hoverProps}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
