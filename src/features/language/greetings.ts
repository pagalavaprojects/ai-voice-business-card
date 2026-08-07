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
  en: "Hello. Welcome to {{company_name}}. I'm {{employee_name}}'s AI assistant, and I'm happy to answer any questions about what we do. How can I help you today?",
  ta: "வணக்கம். {{company_name}} சார்பாக உங்களை அன்புடன் வரவேற்கிறேன். நான் {{employee_name}}-இன் AI உதவியாளர். எங்களுடைய சேவைகள் குறித்து அறிந்துகொள்ள விரும்பினால், தயங்காமல் கேளுங்கள். இப்போது உங்களுக்கு என்ன உதவி செய்யலாம்?",
  hi: "नमस्कार। {{company_name}} में आपका स्वागत है। मैं {{employee_name}} का AI सहायक हूँ, और हमारी सेवाओं के बारे में आपके किसी भी सवाल का जवाब देने में खुशी होगी। मैं आपकी कैसे मदद कर सकता हूँ?",
  te: "నమస్కారం. {{company_name}}కి స్వాగతం. నేను {{employee_name}} యొక్క AI అసిస్టెంట్‌ని. మీకు ఏ సహాయం కావాలన్నా అడగండి. ఈరోజు నేను మీకు ఎలా సహాయపడగలను?",
  ml: "നമസ്കാരം. {{company_name}}-ലേക്ക് സ്വാഗതം. ഞാൻ {{employee_name}}-ന്റെ AI അസിസ്റ്റന്റാണ്. ഞങ്ങളുടെ സേവനങ്ങളെക്കുറിച്ച് എന്തെങ്കിലും ചോദ്യങ്ങളുണ്ടെങ്കിൽ ചോദിക്കാം. ഇന്ന് ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കണം?",
  kn: "ನಮಸ್ಕಾರ. {{company_name}}ಗೆ ಸ್ವಾಗತ. ನಾನು {{employee_name}} ಅವರ AI ಸಹಾಯಕ. ನಮ್ಮ ಸೇವೆಗಳ ಕುರಿತು ಯಾವುದೇ ಪ್ರಶ್ನೆಗಳಿದ್ದರೂ ಕೇಳಬಹುದು. ಇಂದು ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?",
};

export function getDefaultGreeting(language: LanguageCode): string {
  return DEFAULT_GREETINGS[language] ?? DEFAULT_GREETINGS.ta;
}
