import { LanguageCode } from "./config";

/**
 * MaylaanAI's FINAL APPROVED English introduction for the General AI Voice
 * Card ("Talk with AI" / "Play Introduction") opening — supplied verbatim as
 * the source of truth and wired as a code-authored per-company override in
 * resolveGreeting (it wins over the DB greeting for this company's English
 * visitors), the English counterpart of MAYLAANAI_INTRODUCTION_TA. Wording,
 * spelling, punctuation, the numbered list, the en-dashes and line structure
 * are preserved EXACTLY as approved — do not paraphrase, trim, reorder,
 * renumber, "grammar-fix", or machine-translate any of it. This introduction
 * must NEVER be used as the qualification opening — qualification starts
 * directly with Q1 via its own QUALIFICATION_CALL_OPENING override.
 */
export const MAYLAANAI_INTRODUCTION = `Hello.

On behalf of Pagalava Data Analytics Private Limited, we would like to introduce our services to you.

Pagalava Data Analytics is a Women-led Deep Tech Startup company.

We provide the artificial intelligence solutions needed by mid-sized businesses through the Technology as a Service (TaaS) model.

TaaS is a model where companies use the technology facilities they need (Software, Hardware, AI Models, Data Analytics, etc.) on a rental/subscription basis, instead of purchasing them outright.

How TaaS works: Machine Learning models that analyze data with artificial intelligence to support decision-making, along with Big Data that is collected, stored, and analyzed, are delivered through Cloud Platforms.

As a result, companies can use modern technology without needing large investments.

The benefits of TaaS for the Micro, Small, and Medium Enterprises (MSME) sector are as follows:

1. Lower Investment – No need for heavy upfront capital.
2. Scalability – Services can be scaled up or down as the business grows.
3. AI-Powered Decision Making – Analyzing customer behavior and sales trends to support better business decisions.
4. Inventory & Supply Chain Management – Big Data enables accurate inventory management and demand forecasting.
5. Competitiveness – Small businesses gain access to the same advanced technology as large corporations, at a much lower cost.

In summary, TaaS greatly supports MSMEs' growth and competitiveness through accessible, service-based technology.`;

/**
 * MaylaanAI's FINAL APPROVED Tamil introduction for the General AI Voice
 * Card ("Play Introduction" / "Talk with AI" opening) — supplied verbatim as
 * the source of truth and wired as a code-authored per-company override in
 * resolveGreeting (it wins over the DB greeting for this company's Tamil
 * visitors), exactly parallel to MAYLAANAI_INTRODUCTION for English. Wording,
 * spelling, punctuation, spacing and line structure are preserved EXACTLY as
 * approved — do NOT paraphrase, trim, reorder, "grammar-fix", or normalize the
 * embedded English/Tamil mix or the double spaces; this is approved content.
 * Spoken through the SAME Gemini Tamil voice the Tamil pitches use (the pitch
 * route routes ta → Gemini). Like the English one, this must NEVER be used as
 * the qualification opening — qualification starts directly with Q1 via
 * QUALIFICATION_CALL_OPENING.
 */
export const MAYLAANAI_INTRODUCTION_TA = `வணக்கம்.

Pagalava Data Analytics Private Limited சார்பாக எங்களுடைய சேவைகளை உங்களுக்கு தற்பொழுது அறிமுகப்படுத்துகிறோம்.

Pagalava Data Analytics என்பது ஒரு Women-led Deep Tech Startup நிறுவனம்.

நடுத்தர நிறுவனங்களுக்கு தேவையான செயற்கை நுண்ணறிவு தீர்வுகளை Technology as a Service (TaaS) முறையில் வழங்குகிறோம்.

TaaS என்பது நிறுவனங்கள் தங்களுக்கு தேவையான தொழில்நுட்ப வசதிகளை (Software, Hardware, AI Models, Data Analytics போன்றவை) சொந்தமாக வாங்காமல், சேவையாக வாடகை முறையில் பயன்படுத்தும் மாதிரி ஆகும்.

TaaS எப்படி வேலை செய்கிறது: செயற்கை நுண்ணறிவு தரவுகளை பகுப்பாய்வு செய்து, முடிவெடுக்க உதவும் Machine Learning மாடல்களை மற்றும் Big Data தரவுகளை சேகரித்து, சேமித்து, பகுப்பாய்வு செய்து, Cloud Platform மூலம் வழங்கப்படுகின்றன

இதனால் நிறுவனங்கள் பெரிய முதலீடு இல்லாமலேயே, நவீன தொழில்நுட்பத்தை பயன்படுத்த முடியும்.

சிறு, குறு, நடுத்தர தொழில்கள், துறைக்கு TaaS ன் பயன் பாடுகள் பின்வருமாறு: ஒன்று, குறைந்த முதலீடு, இரண்டாவது, scalability, மூன்றாவது, AI-Powered முடிவெடுத்தல் - வாடிக்கையாளர் நடத்தை, விற்பனை போக்கு போன்றவற்றை பகுப்பாய்வு செய்து சிறந்த வணிக முடிவுகள் எடுக்க உதவுகிறது. நான்காவது, Inventory & Supply Chain Management – Big Data மூலம் இருப்பு நிர்வாகம், தேவை கணிப்பு (Demand Forecasting) துல்லியமாகிறது. ஐன்தாவது, போட்டித்திறன் – பெரிய நிறுவனங்களுக்கு இணையான தொழில்நுட்ப வசதிகளை, குறைந்த செலவில் சிறு தொழில்கள் பெற முடிகிறது.

சுருக்கமாக, TaaS என்பது MSMEகளுக்கு சேவைகள் மூலம் அவற்றின் வளர்ச்சிக்கும் போட்டித்திறனுக்கும் பெரிதும் உதவுகிறது.`;

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
