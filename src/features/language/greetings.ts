import { LanguageCode } from "./config";

/**
 * Platform-wide fallback greeting per language — used when a company hasn't
 * authored its own greeting for the visitor's chosen language in
 * `ai_agents.greetings`. Uses the same {{employee_name}}/{{company_name}}
 * template-variable convention as the prompt modules
 * (PromptAssemblyService/substituteTemplateVariables), so any company gets
 * a sensible, on-brand opening in every supported language with zero setup.
 */
export const DEFAULT_GREETINGS: Record<LanguageCode, string> = {
  ta: "வணக்கம். {{company_name}} சார்பாக உங்களை அன்புடன் வரவேற்கிறேன். நான் {{employee_name}}-இன் AI உதவியாளர். எங்களுடைய சேவைகள் குறித்து அறிந்துகொள்ள விரும்பினால், தயங்காமல் கேளுங்கள். இப்போது உங்களுக்கு என்ன உதவி செய்யலாம்?",
  en: "Hello. Welcome to {{company_name}}. I'm {{employee_name}}'s AI assistant, and I'm happy to answer any questions about what we do. How can I help you today?",
  hi: "नमस्कार। {{company_name}} में आपका स्वागत है। मैं {{employee_name}} का AI सहायक हूँ, और हमारी सेवाओं के बारे में आपके किसी भी सवाल का जवाब देने में खुशी होगी। मैं आपकी कैसे मदद कर सकता हूँ?",
};

export function getDefaultGreeting(language: LanguageCode): string {
  return DEFAULT_GREETINGS[language] ?? DEFAULT_GREETINGS.ta;
}
