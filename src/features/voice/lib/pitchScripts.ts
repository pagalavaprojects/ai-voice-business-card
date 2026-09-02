import { LanguageCode } from "@/features/language/config";
import { DEMO_COMPANY_ID } from "@/shared/lib/demoCard";

/**
 * MaylaanAI's FINAL APPROVED pitch content — supplied verbatim by the
 * founder as the single source of truth for all six (English + Tamil ×
 * Elevator/Product/Why Us) and deliberately NOT routed through the
 * composed templates below. Per-company: gated on the company id, so
 * every other tenant keeps the data-composed scripts. The wording,
 * punctuation, capitalization, product names and ordering are preserved
 * EXACTLY as approved — do not paraphrase, shorten, or "improve" any of
 * it. ("usp" is the Why Us / Why Choose Pagalava pitch.)
 */
export const MAYLAANAI_PITCHES: Record<"en" | "ta", Record<PitchType, string>> = {
  en: {
    elevator: `Hello! I represent Pagalava Data Analytics — a Women-led Deep Tech Startup.

We provide AI solutions for mid-sized businesses through Technology as a Service (TaaS) — meaning companies can access powerful AI and Big Data technology on the Cloud, on a pay-as-you-use basis, without any heavy upfront investment.

This gives MSMEs lower costs, smarter data-driven decisions, accurate inventory management, and the ability to compete with much larger companies.

In short — we help small businesses think big, by delivering AI as a Service!`,
    product: `Our Product Smart Lead Card provides More qualified leads, less time wasted chasing the wrong customer

Our product Customer Experience Analytics Understands what keeps your customers coming back and why some walk away

Our product Predictive Business Intelligence Plans your stock, sales, and strategy ahead of the market, not behind it

Our Marketing Performance Optimization Knows exactly which ad, which channel, which rupee is actually working

Our product Operations & Bottleneck Analysis, Finds where time and money are leaking in your operations and plug it.

Our product Fraud Detection & Risk Management Protects your business and your customers' trust, round the clock`,
    usp: `Every business you run generates a goldmine of data — every bill, every customer call, every order.

But between managing staff, suppliers, and customers, who has the time to mine it?

That's where we step in like a trusted partner, not an outside vendor.

We don't hand you complicated software and leave you to figure it out. We deliver plug-and-play intelligence watching your customers, predicting your numbers, optimizing your marketing spend, fixing your operational bottlenecks, and catching fraud, 24/7 so you can focus on what you do best: running your business.

You don't buy AI. You subscribe to outcomes measurable, trackable, and worth every rupee.

This is why growing businesses are choosing Pagalava — not merely to adopt technology, but to gain an edge your competitors don't have.

MaylaanAI — by Pagalava Data Analytics Pvt. Ltd. | A Women-Led Deep-Tech Venture, Proudly Rooted in India`,
  },
  ta: {
    elevator: `MaylaanAI, பெண்கள் முன்னின்று நடத்தும் இந்திய தொடக்க நிறுவனமான Pagalava Data Analytics Private Limited-இன் தொழில்நுட்ப முன்னோடி படைப்பாகும். நீங்கள் உழைக்கும் அளவுக்கே, பெருந்தரவும் (Big Data) செயற்கை நுண்ணறிவும் (AI) உங்களுக்காக உழைக்க வேண்டும் என்பதே எங்கள் அசைக்க முடியாத நம்பிக்கை.

இங்கு ஒவ்வொரு வணிகமும் உறவுகள், நம்பிக்கை, மற்றும் ஆண்டுக்கணக்கில் ஈட்டிய அனுபவத்தின் மீது கட்டப்பட்டது என்பதை நாங்கள் நன்கு அறிவோம். அதை MaylaanAI மாற்றாது; மாறாக, தரவின் துணையுடன் அதை மேலும் வலுவாக்குகிறது. இதனால் உங்கள் முடிவுகள் வெறும் மனத்துணிவை மட்டுமல்ல, உறுதியான ஆதாரத்தையும் சார்ந்தே இருக்கும்.

நாங்கள் வெறும் தொழில்நுட்பத்தை உருவாக்கவில்லை; நீங்கள் நம்பி சார்ந்திருக்கக்கூடிய முடிவுகளை உருவாக்குகிறோம்.

MaylaanAI, இந்திய வணிகங்களுக்காகவே உருவாக்கப்பட்ட ஒரு சேவை-வழி-தொழில்நுட்ப (TaaS) தளமாகும் — பெரிய முதலீடு தேவையில்லை, தனியாக தரவியல் குழு அமைக்க வேண்டியதில்லை, சிக்கலான தகவல் தொழில்நுட்ப அமைப்பும் தேவையில்லை. வளரும் நிறுவனங்களுக்கு ஏற்ற செலவில், நேரடியான பலன்கள் மட்டுமே சேவையாக வழங்கப்படும்.`,
    product: `எங்களின் ஆறு வெவ்வேறு சேவைகள்:

முதலாவது சேவை, Smart Lead Card: சரியான வாடிக்கையாளர்களை மட்டுமே இலக்கு வைத்து, தவறான வாடிக்கையாளர்களை தேடி நேரத்தை வீணாக்காமல் காக்கிறது.

இரண்டாவது சேவை, Customer Experience Analytics: உங்கள் வாடிக்கையாளர் ஏன் மீண்டும் மீண்டும் திரும்பி வருகிறார், ஏன் சிலர் விலகிச் செல்கிறார் என்பதை புரிந்துகொள்கிறது.

மூன்றாவது சேவை, Predictive Business Intelligence: சந்தையை பின்தொடராமல், முன்கூட்டியே உங்கள் ஸ்டாக், விற்பனை மற்றும் உத்தியை திட்டமிடுகிறது.

நான்காவது சேவை, Marketing Performance Optimization: எந்த விளம்பரம், எந்த வழிமுறை, எந்த ரூபாய் உண்மையில் பலன் தருகிறது என்பதை துல்லியமாக அறிகிறது.

ஐந்தாவது சேவை, Operations & Bottleneck Analysis: உங்கள் செயல்பாடுகளில் நேரமும் பணமும் எங்கு கசிந்து வீணாகிறது என கண்டறிந்து, அதை சரிசெய்கிறது.

ஆறாவது சேவை, Fraud Detection & Risk Management: 24 மணி நேரமும் உங்கள் வணிகத்தையும் வாடிக்கையாளர்களின் நம்பிக்கையையும் பாதுகாக்கிறது.`,
    usp: `நாங்கள் ஒரு விற்பனையாளர் அல்ல, உங்களின் நம்பகமான நண்பர்.

நுண்ணறிவு மென்பொருளை உடனடியாகப் பயன்படுத்தக்கூடிய வகையில் சேவைகளை வழங்கும் ஆரோக்கியமான ஆலோசகர்.

உங்களின் ஒவ்வொரு ரூபாயிணையும் மதிப்புள்ள சேவைகளாக மாற்றும் வல்லுநர்.

இதனால்தான் வளர்ந்துவரும் வணிகங்கள் Pagalava-வைத் தேர்ந்தெடுக்கின்றன — வெறும் தொழில்நுட்பத்தைப் பெறுவதற்காக அல்ல, போட்டியாளர்களிடம் இல்லாத ஒரு முன்னிலையைப் பெறுவதற்காக.`,
  },
};

/** The three fixed, speak-only recordings a card offers. These are PRE-
 * RECORDED pitches in the product sense: a fixed script rendered to audio
 * once and replayed — no microphone, no listening, no reasoning, and no
 * Vapi conversational session is ever involved in playing one. (The live
 * AI conversation is a completely separate path — see useVapiSession.) */
export type PitchType = "elevator" | "product" | "usp";

export const PITCH_TYPES: readonly PitchType[] = ["elevator", "product", "usp"] as const;

export function isPitchType(value: string | null | undefined): value is PitchType {
  return value === "elevator" || value === "product" || value === "usp";
}

/**
 * The "Smart AI Lead Business Card" recorded audio item (added 2026-09-01).
 *
 * Two approved, byte-exact scripts — English and Tamil — NOT composed pitches,
 * and deliberately NOT added to PitchType/PITCH_TYPES/isPitchType (those stay
 * the three composed pitches). Like the recorded introduction, each is a fixed
 * script served through the same pitch route + persist-then-serve cache stack,
 * under its own type key AND its own language, so an English request gets the
 * English script/audio (OpenAI voice, the English provider) and a Tamil request
 * gets the Tamil script/audio (Gemini voice) — separate cache identities that
 * can never collide with each other or with elevator/product/usp/intro. Any
 * non-English UI language resolves to Tamil (the only two authored scripts),
 * via getSmartAiLeadBusinessCardScript below.
 *
 * Preserve the wording, spelling, spacing and line structure of BOTH scripts
 * EXACTLY as supplied — including the embedded English terms and the intentional
 * double spaces in the Tamil one. This is approved content: never paraphrase,
 * translate, shorten, "grammar-fix", or normalize whitespace.
 */
export const SMART_AI_LEAD_BUSINESS_CARD_TYPE = "smart_ai_lead_business_card";

export const SMART_AI_LEAD_BUSINESS_CARD_TA = `Smart AI Lead Business Card.

இது செயற்கை நுண்ணறிவு மூலம் இயங்கும் எங்களுடைய  Business Card ஆகும்.

இந்த Business Card-ஐ தங்களுக்கு தேவையான எந்த நேரத்திலும் பயன்படுத்திக்கொள்ளலாம்.

இந்த AI Business Card-ஐ உங்கள் பழைய மற்றும்  புதிய வாடிக்கையாளர் அல்லது Leads-களின் மொபைலில் tap அல்லது QR Code share செய்தவுடன், உங்கள் தொடர்பு விவரங்கள் உடனடியாக அவர்களின் Contact List-இல் சேமிக்கப்படும்.

அதன்பிறகு, உங்கள் நிறுவனத்தை அவர்களுக்கு விளக்கி கூறும்.

பிறகு, அவர்கள் கேட்கும் கேள்விகளுக்கு உடனடியாக பதிலளிக்கும்.

தேவையானால் உங்கள் WhatsApp, Email அல்லது Book an Appointment வழியாக உங்களை நேரடியாக தொடர்பு கொள்ளவும் உதவும்.

Book an Appointment வழியாக, ஆறு தரவுகள் மூலம் Lead Assessment செய்யப்படும்.

வாடிக்கையாளர் அல்லது Lead எத்தனை முறை உங்களது சேவை அல்லது தயாரிப்பு பற்றி AI உடன் தெரிந்து கொண்டுள்ளார்கள் என்பதை உங்களுடைய Dash Board மூலம் தெரிந்து கொள்ளமுடியும்.

வாடிக்கையாளர் அல்லது Lead பெறப்பட்ட Contact Details தனை இரண்டு நாட்களாக பயன் படுத்தவில்லை எனில், அவர்களுக்கு ஒரு நினைவூட்டல் email அல்லது WhatsApp அனுப்பப்படும்.

பெறப்பட்ட அணைத்து தரவுகளையும் உங்களுக்கு Email அல்லது Whatsapp அல்லது Dash Board மூலம் தெரிய படுத்தும்.`;

export const SMART_AI_LEAD_BUSINESS_CARD_EN = `Smart AI Lead Business Card.

This is our AI-powered Business Card.

You can use this Business Card anytime you need it.

When you tap this AI Business Card or share it via QR Code with your existing or new customers and leads, your contact details are instantly saved to their phone's contact list.

It then introduces and explains your business to them.

After that, it instantly answers any questions they ask.

If needed, it also helps them connect with you directly through WhatsApp, Email, or by booking an appointment.

Through the "Book an Appointment" feature, a Lead Assessment is done based on six key data points.

Your Dashboard lets you track how many times a customer or lead has interacted with the AI to learn about your product or service.

If a customer or lead's contact details remain unused for two days, an automatic reminder is sent to them via Email or WhatsApp.

All the data collected is shared with you through Email, WhatsApp, or your Dashboard.`;

/**
 * Resolves the Smart AI Lead Business Card script + its content language for a
 * requested UI language. English gets its own English script (and, downstream,
 * its own English-voice audio and cache key); every other language resolves to
 * the approved Tamil script (the only two authored). The returned `language` is
 * what the route uses for the cache key, ETag and provider routing, so English
 * and Tamil can never share an audio asset.
 */
export function getSmartAiLeadBusinessCardScript(language: string): { language: "en" | "ta"; script: string } {
  return language === "en"
    ? { language: "en", script: SMART_AI_LEAD_BUSINESS_CARD_EN }
    : { language: "ta", script: SMART_AI_LEAD_BUSINESS_CARD_TA };
}

export interface PitchSourceData {
  /** Enables per-company authored overrides (see
   * MAYLAANAI_PITCHES); composition is unaffected when absent. */
  companyId?: string;
  companyName: string;
  employeeName: string;
  designation: string;
  website?: string | null;
  serviceNames: string[];
  services: Array<{ name: string; description: string }>;
  products: Array<{ name: string; description: string }>;
}

/** Joins names naturally for speech ("A, B and C") — an Oxford-comma list
 * read by a TTS voice sounds like a spreadsheet. */
function speakList(items: string[], andWord: string): string {
  const list = items.filter(Boolean).slice(0, 3);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} ${andWord} ${list[list.length - 1]}`;
}

/**
 * Composes the fixed script for one pitch type in one language, from the
 * company's own real data — deterministic templates, never an LLM, so the
 * spoken content can never drift from what the database actually says.
 * Length targets (at a typical ~150 wpm TTS pace): elevator ≈ 30s,
 * product ≈ 40s, usp ≈ 5s.
 *
 * Non-English scripts keep proper nouns (company, person, product and
 * service names) as-is inside native sentence frames — natural in Indian
 * business speech — but do not embed the English description paragraphs,
 * which would produce jarring mid-sentence language switches.
 */
export function composePitchScript(type: PitchType, lang: LanguageCode, data: PitchSourceData): string {
  // Authored override wins over composition: MaylaanAI's approved English
  // and Tamil content for all three pitches, gated on the company id.
  // Every other tenant — and MaylaanAI's other display languages — keeps
  // the data-composed scripts below.
  if ((lang === "en" || lang === "ta") && data.companyId === DEMO_COMPANY_ID) {
    return MAYLAANAI_PITCHES[lang][type];
  }

  const servicesSpoken = speakList(
    data.serviceNames.length > 0 ? data.serviceNames : data.products.map((p) => p.name),
    { en: "and", ta: "மற்றும்", hi: "और", te: "మరియు", ml: "കൂടാതെ", kn: "ಮತ್ತು" }[lang]
  );
  const productLines = data.products.slice(0, 3);

  if (type === "usp") {
    const what = servicesSpoken || data.companyName;
    switch (lang) {
      case "ta":
        return `${data.companyName} — ${what} சேவைகளுடன், எப்போதும் உங்களுக்காக.`;
      case "hi":
        return `${data.companyName} — ${what} के साथ, हर समय आपके लिए।`;
      case "te":
        return `${data.companyName} — ${what} తో, ఎల్లప్పుడూ మీ కోసం.`;
      case "ml":
        return `${data.companyName} — ${what} സേവനങ്ങളുമായി, എപ്പോഴും നിങ്ങൾക്കായി.`;
      case "kn":
        return `${data.companyName} — ${what} ಸೇವೆಗಳೊಂದಿಗೆ, ಯಾವಾಗಲೂ ನಿಮಗಾಗಿ.`;
      default:
        return `${data.companyName} — ${what}, working for you around the clock.`;
    }
  }

  if (type === "elevator") {
    switch (lang) {
      case "ta":
        return (
          `வணக்கம். நான் ${data.employeeName}, ${data.companyName} நிறுவனத்தில் ${data.designation}. ` +
          (servicesSpoken ? `நாங்கள் ${servicesSpoken} போன்ற சேவைகளை வழங்குகிறோம். ` : "") +
          `உங்கள் வணிகத்தின் தேவைகளைப் புரிந்துகொண்டு, அதற்கேற்ற தீர்வுகளை நாங்கள் உருவாக்குகிறோம். ` +
          `எங்கள் சேவைகள் பற்றி மேலும் அறிய, இந்த அட்டையின் AI உதவியாளரிடம் நேரடியாகக் கேளுங்கள், ` +
          `அல்லது ஒரு சந்திப்பை இப்போது பதிவு செய்யுங்கள். நன்றி.`
        );
      case "hi":
        return (
          `नमस्कार। मैं ${data.employeeName}, ${data.companyName} में ${data.designation}। ` +
          (servicesSpoken ? `हम ${servicesSpoken} जैसी सेवाएँ प्रदान करते हैं। ` : "") +
          `हम आपके व्यवसाय की ज़रूरतों को समझकर उनके लिए सही समाधान बनाते हैं। ` +
          `अधिक जानने के लिए इस कार्ड के AI सहायक से सीधे बात करें, या अभी एक मीटिंग बुक करें। धन्यवाद।`
        );
      case "te":
        return (
          `నమస్కారం. నేను ${data.employeeName}, ${data.companyName} లో ${data.designation}. ` +
          (servicesSpoken ? `మేము ${servicesSpoken} వంటి సేవలను అందిస్తాము. ` : "") +
          `మీ వ్యాపార అవసరాలను అర్థం చేసుకుని, వాటికి తగిన పరిష్కారాలను మేము రూపొందిస్తాము. ` +
          `మరింత తెలుసుకోవడానికి ఈ కార్డ్ యొక్క AI అసిస్టెంట్‌తో నేరుగా మాట్లాడండి, లేదా ఇప్పుడే మీటింగ్ బుక్ చేసుకోండి. ధన్యవాదాలు.`
        );
      case "ml":
        return (
          `നമസ്കാരം. ഞാൻ ${data.employeeName}, ${data.companyName}-ൽ ${data.designation}. ` +
          (servicesSpoken ? `ഞങ്ങൾ ${servicesSpoken} തുടങ്ങിയ സേവനങ്ങൾ നൽകുന്നു. ` : "") +
          `നിങ്ങളുടെ ബിസിനസ്സിന്റെ ആവശ്യങ്ങൾ മനസ്സിലാക്കി അതിനനുസരിച്ചുള്ള പരിഹാരങ്ങൾ ഞങ്ങൾ ഒരുക്കുന്നു. ` +
          `കൂടുതൽ അറിയാൻ ഈ കാർഡിന്റെ AI അസിസ്റ്റന്റിനോട് നേരിട്ട് ചോദിക്കൂ, അല്ലെങ്കിൽ ഇപ്പോൾ ഒരു മീറ്റിംഗ് ബുക്ക് ചെയ്യൂ. നന്ദി.`
        );
      case "kn":
        return (
          `ನಮಸ್ಕಾರ. ನಾನು ${data.employeeName}, ${data.companyName} ನಲ್ಲಿ ${data.designation}. ` +
          (servicesSpoken ? `ನಾವು ${servicesSpoken} ಮುಂತಾದ ಸೇವೆಗಳನ್ನು ಒದಗಿಸುತ್ತೇವೆ. ` : "") +
          `ನಿಮ್ಮ ವ್ಯವಹಾರದ ಅಗತ್ಯಗಳನ್ನು ಅರ್ಥಮಾಡಿಕೊಂಡು ಸೂಕ್ತ ಪರಿಹಾರಗಳನ್ನು ನಾವು ರೂಪಿಸುತ್ತೇವೆ. ` +
          `ಹೆಚ್ಚು ತಿಳಿಯಲು ಈ ಕಾರ್ಡ್‌ನ AI ಸಹಾಯಕರೊಂದಿಗೆ ನೇರವಾಗಿ ಮಾತನಾಡಿ, ಅಥವಾ ಈಗಲೇ ಮೀಟಿಂಗ್ ಬುಕ್ ಮಾಡಿ. ಧನ್ಯವಾದಗಳು.`
        );
      default: {
        const firstService = data.services[0];
        return (
          `Hello, I'm ${data.employeeName}, ${data.designation} at ${data.companyName}. ` +
          (servicesSpoken ? `We help businesses with ${servicesSpoken}. ` : "") +
          (firstService?.description ? `${firstService.description} ` : "") +
          `We take the time to understand what your business actually needs, and build the right solution around it. ` +
          `To learn more, just ask this card's AI assistant directly — or book a meeting right now. Thank you.`
        );
      }
    }
  }

  // product pitch
  const namesSpoken = speakList(
    productLines.map((p) => p.name),
    { en: "and", ta: "மற்றும்", hi: "और", te: "మరియు", ml: "കൂടാതെ", kn: "ಮತ್ತು" }[lang]
  );
  switch (lang) {
    case "ta":
      return (
        `வணக்கம். ${data.companyName} நிறுவனத்தின் தயாரிப்புகளை உங்களுக்கு அறிமுகப்படுத்துகிறேன். ` +
        (namesSpoken ? `எங்களுடைய முக்கிய தயாரிப்புகள்: ${namesSpoken}. ` : "") +
        `ஒவ்வொன்றும் உங்கள் வணிகத்தை வளர்க்கவும், நேரத்தைச் சேமிக்கவும், வாடிக்கையாளர்களுடன் சிறப்பாக இணைந்திருக்கவும் உதவும் வகையில் உருவாக்கப்பட்டவை. ` +
        `விலை விவரங்கள், அம்சங்கள், உங்களுக்கு எது பொருத்தமானது என்பதை அறிய இந்த அட்டையின் AI உதவியாளரிடம் கேளுங்கள். ` +
        `ஒரு நேரடி விளக்கத்திற்கு, இப்போதே ஒரு சந்திப்பை பதிவு செய்யலாம். நன்றி.`
      );
    case "hi":
      return (
        `नमस्कार। ${data.companyName} के उत्पादों से आपका परिचय कराता हूँ। ` +
        (namesSpoken ? `हमारे प्रमुख उत्पाद हैं: ${namesSpoken}। ` : "") +
        `हर उत्पाद आपके व्यवसाय को बढ़ाने, समय बचाने और ग्राहकों से बेहतर जुड़ने के लिए बनाया गया है। ` +
        `कीमत, विशेषताओं और आपके लिए सही विकल्प जानने के लिए इस कार्ड के AI सहायक से पूछें। ` +
        `लाइव डेमो के लिए अभी एक मीटिंग बुक करें। धन्यवाद।`
      );
    case "te":
      return (
        `నమస్కారం. ${data.companyName} ఉత్పత్తులను మీకు పరిచయం చేస్తున్నాను. ` +
        (namesSpoken ? `మా ముఖ్య ఉత్పత్తులు: ${namesSpoken}. ` : "") +
        `ప్రతి ఒక్కటీ మీ వ్యాపారాన్ని పెంచడానికి, సమయాన్ని ఆదా చేయడానికి, కస్టమర్లతో మెరుగ్గా కనెక్ట్ అవ్వడానికి రూపొందించబడింది. ` +
        `ధరలు, ఫీచర్లు, మీకు ఏది సరైనదో తెలుసుకోవడానికి ఈ కార్డ్ AI అసిస్టెంట్‌ని అడగండి. ` +
        `లైవ్ డెమో కోసం ఇప్పుడే మీటింగ్ బుక్ చేసుకోండి. ధన్యవాదాలు.`
      );
    case "ml":
      return (
        `നമസ്കാരം. ${data.companyName}-ന്റെ ഉൽപ്പന്നങ്ങൾ നിങ്ങൾക്ക് പരിചയപ്പെടുത്തുന്നു. ` +
        (namesSpoken ? `ഞങ്ങളുടെ പ്രധാന ഉൽപ്പന്നങ്ങൾ: ${namesSpoken}. ` : "") +
        `ഓരോന്നും നിങ്ങളുടെ ബിസിനസ്സ് വളർത്താനും സമയം ലാഭിക്കാനും ഉപഭോക്താക്കളുമായി മികച്ച രീതിയിൽ ബന്ധപ്പെടാനും വേണ്ടി രൂപകൽപ്പന ചെയ്തതാണ്. ` +
        `വില, സവിശേഷതകൾ, നിങ്ങൾക്ക് അനുയോജ്യമായത് എന്നിവ അറിയാൻ ഈ കാർഡിന്റെ AI അസിസ്റ്റന്റിനോട് ചോദിക്കൂ. ` +
        `ലൈവ് ഡെമോയ്ക്കായി ഇപ്പോൾ ഒരു മീറ്റിംഗ് ബുക്ക് ചെയ്യൂ. നന്ദി.`
      );
    case "kn":
      return (
        `ನಮಸ್ಕಾರ. ${data.companyName} ಉತ್ಪನ್ನಗಳನ್ನು ನಿಮಗೆ ಪರಿಚಯಿಸುತ್ತಿದ್ದೇನೆ. ` +
        (namesSpoken ? `ನಮ್ಮ ಪ್ರಮುಖ ಉತ್ಪನ್ನಗಳು: ${namesSpoken}. ` : "") +
        `ಪ್ರತಿಯೊಂದೂ ನಿಮ್ಮ ವ್ಯವಹಾರವನ್ನು ಬೆಳೆಸಲು, ಸಮಯ ಉಳಿಸಲು ಮತ್ತು ಗ್ರಾಹಕರೊಂದಿಗೆ ಉತ್ತಮವಾಗಿ ಸಂಪರ್ಕದಲ್ಲಿರಲು ವಿನ್ಯಾಸಗೊಳಿಸಲಾಗಿದೆ. ` +
        `ಬೆಲೆ, ವೈಶಿಷ್ಟ್ಯಗಳು ಮತ್ತು ನಿಮಗೆ ಸೂಕ್ತವಾದದ್ದನ್ನು ತಿಳಿಯಲು ಈ ಕಾರ್ಡ್‌ನ AI ಸಹಾಯಕರನ್ನು ಕೇಳಿ. ` +
        `ಲೈವ್ ಡೆಮೋಗಾಗಿ ಈಗಲೇ ಮೀಟಿಂಗ್ ಬುಕ್ ಮಾಡಿ. ಧನ್ಯವಾದಗಳು.`
      );
    default: {
      const productDetail = productLines
        .map((p) => {
          const firstSentence = p.description.split(/(?<=[.!?])\s+/)[0] ?? "";
          return `${p.name}. ${firstSentence}`;
        })
        .join(" ");
      return (
        `Hello. Let me introduce you to what ${data.companyName} builds. ` +
        (productDetail
          ? `${productDetail} `
          : `We design every product around one goal: helping your business grow while saving you time. `) +
        `Each one is built to help you grow, save time, and stay closer to your customers. ` +
        `For pricing, features, or which option fits you best, just ask this card's AI assistant — ` +
        `or book a meeting now for a live walkthrough. Thank you.`
      );
    }
  }
}
