import { UnknownWhatsAppProviderError } from "./errors";
import type { WhatsAppProvider } from "./types";
import type { WhatsAppProviderName } from "@/lib/types/database";
import { NoOpWhatsAppProvider } from "./providers/noop";
import { MetaCloudWhatsAppProvider } from "./providers/meta-cloud";
import { TwilioWhatsAppProvider } from "./providers/twilio";

/**
 * المكان الوحيد لربط اسم Provider بتطبيقه الفعلي. لإضافة مزوّد جديد
 * (UltraMsg, GreenAPI, 360dialog): أنشئ ملفه في providers/ وسجّله هنا
 * — من غير أي تعديل في WhatsAppService أو أي كود تاني.
 */
const providers: Partial<Record<WhatsAppProviderName, WhatsAppProvider>> = {
  noop: new NoOpWhatsAppProvider(),
  meta_cloud: new MetaCloudWhatsAppProvider(),
  twilio: new TwilioWhatsAppProvider(),
};

export function getWhatsAppProvider(name: WhatsAppProviderName): WhatsAppProvider {
  const provider = providers[name];
  if (!provider) throw new UnknownWhatsAppProviderError(name);
  return provider;
}

export function listAvailableWhatsAppProviders(): WhatsAppProviderName[] {
  return Object.keys(providers) as WhatsAppProviderName[];
}
