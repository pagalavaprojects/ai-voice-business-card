import { LanguageCode } from "./config";

/**
 * MaylaanAI's FINAL APPROVED English introduction for the General AI Voice
 * Card ("Talk with AI") opening — supplied verbatim as the source of truth
 * and wired as an authored per-company override in resolveGreeting (it wins
 * over the DB greeting for this company's English visitors). Wording,
 * punctuation, ordering and capitalization are preserved EXACTLY as
 * approved — do not paraphrase, trim, reorder, or "grammar-fix" any of it,
 * and do not machine-translate it (only English was supplied; the Tamil
 * introduction remains the previously authored DB greeting and is a
 * separate content decision). Note: this text intentionally says "their
 * competitors" where the Why Us pitch says "your competitors" — both are
 * as supplied. This introduction must NEVER be used as the qualification
 * opening — qualification starts directly with Q1 via its own
 * QUALIFICATION_CALL_OPENING override.
 */
export const MAYLAANAI_INTRODUCTION = `MaylaanAI

Your Business Insight, Backed by Deep-Tech

MaylaanAI is the deep-tech flagship of Pagalava Data Analytics Private Limited, a proudly women-led Indian startup, built on the belief that Big Data and AI should work as hard as you do.

We understand that every business here is built on relationships, trust, and years of hard-earned experience. MaylaanAI doesn't replace that it strengthens it with data, so your decisions are backed by evidence, not just instinct.

We don't just build technology. We build outcomes you can bank on.

MaylaanAI is a Technology-as-a-Service (TaaS) platform built for Indian businesses, no heavy upfront investment, no hiring a data science team, no complicated IT overhead. Just results, delivered as a service, at a cost that makes sense for growing enterprises.

Our Product Smart Lead Card provides More qualified leads, less time wasted chasing the wrong customer

Our product Customer Experience Analytics Understands what keeps your customers coming back and why some walk away

Our product Predictive Business Intelligence Plans your stock, sales, and strategy ahead of the market, not behind it

Our Marketing Performance Optimization Knows exactly which ad, which channel, which rupee is actually working

Our product Operations & Bottleneck Analysis, Finds where time and money are leaking in your operations and plug it.

Our product Fraud Detection & Risk Management Protects your business and your customers' trust, round the clock

Every business you run generates a goldmine of data — every bill, every customer call, every order.

But between managing staff, suppliers, and customers, who has the time to mine it?

That's where we step in like a trusted partner, not an outside vendor.

We don't hand you complicated software and leave you to figure it out. We deliver plug-and-play intelligence watching your customers, predicting your numbers, optimizing your marketing spend, fixing your operational bottlenecks, and catching fraud, 24/7 so you can focus on what you do best: running your business.

You don't buy AI. You subscribe to outcomes measurable, trackable, and worth every rupee.

This is why growing businesses are choosing Pagalava — not merely to adopt technology, but to gain an edge their competitors don't have.

MaylaanAI — by Pagalava Data Analytics Pvt. Ltd. | A Women-Led Deep-Tech Venture, Proudly Rooted in India`;

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
