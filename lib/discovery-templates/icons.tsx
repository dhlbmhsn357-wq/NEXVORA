import {
  GraduationCap,
  Megaphone,
  Building2,
  Cloud,
  Globe,
  ShoppingCart,
  Stethoscope,
  Home,
  UtensilsCrossed,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/** أيقونات القوالب المتاحة (اسم -> مكوّن). fallback = Sparkles. */
export const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  GraduationCap,
  Megaphone,
  Building2,
  Cloud,
  Globe,
  ShoppingCart,
  Stethoscope,
  Home,
  UtensilsCrossed,
  Sparkles,
};

export const TEMPLATE_ICON_NAMES = Object.keys(TEMPLATE_ICONS);

export function getTemplateIcon(name: string | null | undefined): LucideIcon {
  if (name && TEMPLATE_ICONS[name]) return TEMPLATE_ICONS[name];
  return Sparkles;
}
