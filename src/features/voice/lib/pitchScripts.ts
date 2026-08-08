import { LanguageCode } from "@/features/language/config";
import { DEMO_COMPANY_ID } from "@/shared/lib/demoCard";

/**
 * Pagalava's own AUTHORED Tamil elevator pitch — supplied verbatim by the
 * founder as source-of-truth content and deliberately NOT routed through
 * the composed templates below. Per-company: gated on the company id so
 * every other tenant keeps the data-composed script. (The one authoring
 * deviation: the supplied text closed with a markdown heading "## நன்றிகள்."
 * — the "##" is formatting, not speech, so only the words are kept.)
 * When per-company pitch authoring gets a real CMS field, this constant
 * is the content that should seed it.
 */
export const PAGALAVA_TAMIL_ELEVATOR_PITCH = `இந்த மாசம் எத்தனை பேர் உங்க பிசினஸ் கார்டை கொடுத்திருப்பீங்க… ஆனா திரும்பி ஒரு காலும் வரலையா?

அது உங்க தப்பு இல்ல — அந்த கார்டோட தப்பு.

ஒரு பேப்பர் கார்டு உங்க நம்பரை மட்டும்தான் கொடுக்கும். அது உங்களை பிட்ச் பண்ணாது. அவங்க ஒரு நல்ல லீட்டா இல்லையான்னு தெரிஞ்சுக்காது. அப்பாயின்ட்மென்ட் புக் பண்ணாது. நீங்க பின்னாடி கூப்பிடும்போதைக்கு, அவங்களுக்கு ஏன் அந்த கார்டை வாங்கினோம்னே மறந்திருக்கும்.

நான் அதுக்கு வேற ஒரு solution கொண்டு வந்திருக்கேன் — ஒரு AI Voice Business Card.

இது ஒரு NFC கார்டு — வெறும் ஒரு டேப் அல்லது QR ஸ்கேன் போதும் — அப்புறம் நான் எதுவும் செய்யாம இது தானா செய்யும்:

முதல்ல உங்களோட 30 செகண்ட் எலிவேட்டர் பிட்ச் ப்ளே ஆகும்.
அப்புறம் புராடக்ட் பிட்ச்.
அப்புறம் உங்களோட USP — AI குரலில, ஒவ்வொரு தடவையும் அதே மாதிரி.

அப்புறம் இது ஒரு பேப்பர் கார்டால் ஒரு நாளும் செய்ய முடியாத ஒரு காரியம் செய்யும் — அது உங்க லீட்ஸ் கூட உரையாடும்.

அங்கயே, AI voice மூலமா பேசி — அவங்க ஒரு உண்மையான ப்ராஸ்பெக்ட்டா இல்லையான்னும், அவங்க எவ்ளோ close ஆயிருக்காங்கன்னும் கண்டுபிடிக்கும்.

அவங்க qualify ஆனா, உடனே அப்பாயின்ட்மென்ட் புக் ஆகிடும் — அப்புறம் WhatsApp-ல உங்க ரெண்டு பேருக்கும் reminder போயிடும், so no-show குறையும்.

அதனால நான் கார்டு குவியல வச்சு பின்னாடி ஓடிக்கிட்டு இருக்கிறதுக்கு பதிலா...

நீங்க தூங்கி எழுந்திருக்கும்போதே உங்களுக்கு qualify ஆன, பேச ரெடியா இருக்குற லீட்ஸ் லிஸ்ட் கிடைச்சிருக்கும் — ஏற்கனவே உங்க பிட்ச் கேட்டு, மீட்டிங்குக்கு 'yes' சொல்லிட்டு.

இந்த கார்டை நேர்ல டேப் பண்ணி நீங்களே கேளுங்க...

நன்றிகள்.`;

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

export interface PitchSourceData {
  /** Enables per-company authored overrides (see
   * PAGALAVA_TAMIL_ELEVATOR_PITCH); composition is unaffected when absent. */
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
  // Authored override wins over composition — currently only Pagalava's own
  // Tamil elevator pitch. Every other (company, type, language) keeps the
  // data-composed script below.
  if (type === "elevator" && lang === "ta" && data.companyId === DEMO_COMPANY_ID) {
    return PAGALAVA_TAMIL_ELEVATOR_PITCH;
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
