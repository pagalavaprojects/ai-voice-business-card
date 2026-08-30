import { ICRMRepository } from "../../domain/repositories/ICRMRepository";
import { IBookingRepository } from "../../domain/repositories/IBookingRepository";
import { IKnowledgeRepository } from "../../domain/repositories/IKnowledgeRepository";
import { NotificationService } from "../services/NotificationService";
import { LeadQualificationService } from "../services/LeadQualificationService";
import { CalcomAdapter } from "../../infrastructure/booking/calcom/CalcomAdapter";
import { ISettingsRepository } from "../../domain/repositories/ISettingsRepository";
import { IKnowledgeDocumentRepository } from "../../domain/repositories/IKnowledgeDocumentRepository";
import { OpenAIEmbeddingAdapter } from "../../infrastructure/embeddings/OpenAIEmbeddingAdapter";
import { getWhatsAppNotifier } from "../../infrastructure/notifications/WhatsAppNotifier";
import { SupabaseWhatsAppIdempotencyStore } from "../../infrastructure/notifications/WhatsAppIdempotency";
import {
  buildAppointmentConfirmedSpeech,
  classifyClosedResponse,
  getAnswerGuidance,
  getAuthoredQuestion,
  getContinuePrompt,
  toQualificationLanguage,
  withAnswerGuidance,
} from "@/features/voice/lib/qualificationScript";
import { AppointmentStatus, LeadTemperature, NurtureStatus, LeadQualificationSignalsSchema, type Appointment } from "../../domain/models/types";
import { Logger } from "@/shared/lib/logger";

export const KNOWN_TOOL_NAMES = [
  "save_lead",
  "update_lead_qualification",
  "book_appointment",
  "search_products",
  "search_services",
  "search_faqs",
  "search_knowledge_base",
  "get_company_information",
  "get_employee_information",
] as const;

/** Extended qualification-signal parameters shared by both `save_lead` and
 * `update_lead_qualification`'s JSON schemas — kept as one constant so the
 * two tools can never drift into accepting subtly different shapes for the
 * same underlying fields. */
const QUALIFICATION_SIGNAL_PARAMETERS: Record<string, unknown> = {
  decision_maker: {
    type: "string",
    enum: ["yes", "no", "shared"],
    description: "Whether the visitor confirmed they can personally approve this purchase, only if they said so explicitly.",
  },
  urgency: {
    type: "string",
    enum: ["immediate", "this_quarter", "exploring"],
    description: "How soon the visitor indicated they want to move, only if they said so.",
  },
  buying_intent: {
    type: "string",
    enum: ["high", "medium", "low"],
    description: "Your honest read of how ready the visitor is to buy, based only on what they actually said — never guessed to be generous.",
  },
  objections: { type: "string", description: "Any concerns or hesitations the visitor raised (price, timing, trust, etc.)." },
  current_solution: { type: "string", description: "What the visitor is currently using or doing instead, if they mentioned it." },
  referral_source: { type: "string", description: "How the visitor found this card, if they mentioned it." },
  sentiment: { type: "string", enum: ["positive", "neutral", "negative"], description: "The visitor's overall tone in this conversation." },
  qualification_confidence: {
    type: "number",
    description: "Your own confidence (0 to 1) in this qualification read — low if you're going mostly on limited signals.",
  },
  conversation_summary: { type: "string", description: "A short internal summary of the conversation so far, for the human who reviews this lead later." },
  qualification_notes: { type: "string", description: "Any other internal reasoning worth recording — never shown to the visitor." },
};

/** Warm, no-pressure cold-lead nurture email — sent once per lead the
 * moment qualification classifies them COLD (see ToolRegistry's save_lead
 * and update_lead_qualification), so a lead who isn't ready today is never
 * simply dropped. Deliberately short: the goal is "we're here when you're
 * ready," not a hard second pitch. */
const NURTURE_EMAIL_COPY: Record<string, { subject: string; body: (name: string, employeeName: string) => string }> = {
  en: {
    subject: "Thanks for the conversation — we're here when you're ready",
    body: (name, employeeName) =>
      `<p>Hi ${name},</p><p>Thank you for taking the time to talk with us. No rush at all — whenever the timing is right, we'd be glad to pick the conversation back up.</p><p>Feel free to reply to this email anytime with questions. ${employeeName} will personally follow up.</p>`,
  },
  ta: {
    subject: "உரையாடலுக்கு நன்றி — நீங்கள் தயாராகும்போது நாங்கள் இருக்கிறோம்",
    body: (name, employeeName) =>
      `<p>வணக்கம் ${name},</p><p>எங்களுடன் பேச நேரம் ஒதுக்கியதற்கு நன்றி. அவசரம் இல்லை — சரியான நேரத்தில் உரையாடலைத் தொடரலாம்.</p><p>ஏதேனும் கேள்விகள் இருந்தால் இந்த மின்னஞ்சலுக்கு பதிலளிக்கவும். ${employeeName} நேரடியாகத் தொடர்பு கொள்வார்.</p>`,
  },
  hi: {
    subject: "बातचीत के लिए धन्यवाद — जब आप तैयार हों, हम यहाँ हैं",
    body: (name, employeeName) =>
      `<p>नमस्ते ${name},</p><p>हमसे बात करने के लिए समय निकालने हेतु धन्यवाद। कोई जल्दी नहीं है — सही समय पर हम बातचीत आगे बढ़ा सकते हैं।</p><p>कोई भी सवाल हो तो इस ईमेल का जवाब दें। ${employeeName} व्यक्तिगत रूप से फॉलो-अप करेंगे।</p>`,
  },
  te: {
    subject: "సంభాషణకు ధన్యవాదాలు — మీరు సిద్ధంగా ఉన్నప్పుడు మేము ఇక్కడ ఉన్నాము",
    body: (name, employeeName) =>
      `<p>నమస్తే ${name},</p><p>మాతో మాట్లాడటానికి సమయం కేటాయించినందుకు ధన్యవాదాలు. తొందర లేదు — సరైన సమయంలో సంభాషణను కొనసాగించవచ్చు.</p><p>ఏవైనా ప్రశ్నలు ఉంటే ఈ ఇమెయిల్‌కు రిప్లై ఇవ్వండి. ${employeeName} వ్యక్తిగతంగా ఫాలో అప్ చేస్తారు.</p>`,
  },
  ml: {
    subject: "സംഭാഷണത്തിന് നന്ദി — നിങ്ങൾ തയ്യാറാകുമ്പോൾ ഞങ്ങൾ ഇവിടെയുണ്ട്",
    body: (name, employeeName) =>
      `<p>നമസ്കാരം ${name},</p><p>ഞങ്ങളോട് സംസാരിക്കാൻ സമയം കണ്ടെത്തിയതിന് നന്ദി. തിരക്കില്ല — ശരിയായ സമയത്ത് സംഭാഷണം തുടരാം.</p><p>എന്തെങ്കിലും ചോദ്യങ്ങൾ ഉണ്ടെങ്കിൽ ഈ ഇമെയിലിന് മറുപടി നൽകുക. ${employeeName} നേരിട്ട് ബന്ധപ്പെടും.</p>`,
  },
  kn: {
    subject: "ಸಂಭಾಷಣೆಗೆ ಧನ್ಯವಾದಗಳು — ನೀವು ಸಿದ್ಧರಾದಾಗ ನಾವು ಇಲ್ಲಿದ್ದೇವೆ",
    body: (name, employeeName) =>
      `<p>ನಮಸ್ಕಾರ ${name},</p><p>ನಮ್ಮೊಂದಿಗೆ ಮಾತನಾಡಲು ಸಮಯ ಮೀಸಲಿಟ್ಟಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು. ಆತುರವಿಲ್ಲ — ಸರಿಯಾದ ಸಮಯದಲ್ಲಿ ಸಂಭಾಷಣೆ ಮುಂದುವರಿಸಬಹುದು.</p><p>ಯಾವುದೇ ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ ಈ ಇಮೇಲ್‌ಗೆ ಪ್ರತ್ಯುತ್ತರಿಸಿ. ${employeeName} ವೈಯಕ್ತಿಕವಾಗಿ ಫಾಲೋ ಅಪ್ ಮಾಡುತ್ತಾರೆ.</p>`,
  },
};

export interface ToolContext {
  companyId: string;
  employeeId: string;
  conversationId?: string;
  /** The visitor's chosen conversation language ("en"/"ta"/"hi"/"te"/"ml"/
   * "kn"), resolved by the caller (the webhook route from the live call's
   * ?lang= param, the public booking route from the submitted form) —
   * deliberately a plain string, not features/language's LanguageCode type,
   * so this application-layer file has no dependency on that UI-adjacent
   * feature module. Unset or unrecognized falls back to English, never a
   * thrown error: a booking must still succeed even if language resolution
   * fails. */
  language?: string;
}

/** Visitor-facing appointment email copy, one of the few genuinely
 * user-visible strings this application-layer module owns — everything
 * else here is either internal (the employee's high-value-lead alert stays
 * in the platform's own language deliberately) or already routed through
 * the caller's own translation layer. English is the fallback for any
 * language code this map doesn't recognize. */
const APPOINTMENT_EMAIL_COPY: Record<
  string,
  {
    confirmedSubject: string;
    requestedSubject: string;
    confirmedBody: (name: string, when: string, meetingUrl?: string) => string;
    requestedBody: (name: string, when: string) => string;
  }
> = {
  en: {
    confirmedSubject: "Your meeting is confirmed",
    requestedSubject: "We've received your meeting request",
    confirmedBody: (name, when, meetingUrl) =>
      `<p>Hi ${name},</p><p>Your meeting is confirmed for <strong>${when}</strong>.</p>${meetingUrl ? `<p><a href="${meetingUrl}">Join the meeting</a></p>` : ""}`,
    requestedBody: (name, when) =>
      `<p>Hi ${name},</p><p>Thanks — we've noted your preferred time of <strong>${when}</strong>. You'll receive a calendar invitation once it's confirmed.</p>`,
  },
  ta: {
    confirmedSubject: "உங்கள் சந்திப்பு உறுதி செய்யப்பட்டது",
    requestedSubject: "உங்கள் சந்திப்பு கோரிக்கை பெறப்பட்டது",
    confirmedBody: (name, when, meetingUrl) =>
      `<p>வணக்கம் ${name},</p><p>உங்கள் சந்திப்பு <strong>${when}</strong> அன்று உறுதி செய்யப்பட்டுள்ளது.</p>${meetingUrl ? `<p><a href="${meetingUrl}">கூட்டத்தில் இணையவும்</a></p>` : ""}`,
    requestedBody: (name, when) =>
      `<p>வணக்கம் ${name},</p><p>நன்றி — உங்கள் விருப்பமான நேரமான <strong>${when}</strong> பதிவு செய்யப்பட்டுள்ளது. உறுதி செய்யப்பட்டவுடன் கேலெண்டர் அழைப்பிதழ் பெறுவீர்கள்.</p>`,
  },
  hi: {
    confirmedSubject: "आपकी मीटिंग की पुष्टि हो गई है",
    requestedSubject: "आपका मीटिंग अनुरोध प्राप्त हो गया है",
    confirmedBody: (name, when, meetingUrl) =>
      `<p>नमस्ते ${name},</p><p>आपकी मीटिंग <strong>${when}</strong> के लिए पुष्टि की जा चुकी है।</p>${meetingUrl ? `<p><a href="${meetingUrl}">मीटिंग में शामिल हों</a></p>` : ""}`,
    requestedBody: (name, when) =>
      `<p>नमस्ते ${name},</p><p>धन्यवाद — आपका पसंदीदा समय <strong>${when}</strong> दर्ज कर लिया गया है। पुष्टि होते ही आपको कैलेंडर आमंत्रण मिलेगा।</p>`,
  },
  te: {
    confirmedSubject: "మీ మీటింగ్ నిర్ధారించబడింది",
    requestedSubject: "మీ మీటింగ్ అభ్యర్థన అందుకున్నాము",
    confirmedBody: (name, when, meetingUrl) =>
      `<p>నమస్తే ${name},</p><p>మీ మీటింగ్ <strong>${when}</strong> కు నిర్ధారించబడింది.</p>${meetingUrl ? `<p><a href="${meetingUrl}">మీటింగ్‌లో చేరండి</a></p>` : ""}`,
    requestedBody: (name, when) =>
      `<p>నమస్తే ${name},</p><p>ధన్యవాదాలు — మీరు ఇష్టపడే సమయం <strong>${when}</strong> నమోదు చేయబడింది. నిర్ధారించిన వెంటనే మీకు క్యాలెండర్ ఆహ్వానం అందుతుంది.</p>`,
  },
  ml: {
    confirmedSubject: "നിങ്ങളുടെ മീറ്റിംഗ് സ്ഥിരീകരിച്ചു",
    requestedSubject: "നിങ്ങളുടെ മീറ്റിംഗ് അഭ്യർത്ഥന ലഭിച്ചു",
    confirmedBody: (name, when, meetingUrl) =>
      `<p>നമസ്കാരം ${name},</p><p>നിങ്ങളുടെ മീറ്റിംഗ് <strong>${when}</strong>-ന് സ്ഥിരീകരിച്ചു.</p>${meetingUrl ? `<p><a href="${meetingUrl}">മീറ്റിംഗിൽ ചേരുക</a></p>` : ""}`,
    requestedBody: (name, when) =>
      `<p>നമസ്കാരം ${name},</p><p>നന്ദി — നിങ്ങൾ ഇഷ്ടപ്പെടുന്ന സമയം <strong>${when}</strong> രേഖപ്പെടുത്തി. സ്ഥിരീകരിച്ചുകഴിഞ്ഞാൽ ഉടൻ കലണ്ടർ ക്ഷണം ലഭിക്കും.</p>`,
  },
  kn: {
    confirmedSubject: "ನಿಮ್ಮ ಸಭೆ ದೃಢಪಡಿಸಲಾಗಿದೆ",
    requestedSubject: "ನಿಮ್ಮ ಸಭೆ ವಿನಂತಿ ಸ್ವೀಕರಿಸಲಾಗಿದೆ",
    confirmedBody: (name, when, meetingUrl) =>
      `<p>ನಮಸ್ಕಾರ ${name},</p><p>ನಿಮ್ಮ ಸಭೆ <strong>${when}</strong> ಗೆ ದೃಢಪಡಿಸಲಾಗಿದೆ.</p>${meetingUrl ? `<p><a href="${meetingUrl}">ಸಭೆಗೆ ಸೇರಿ</a></p>` : ""}`,
    requestedBody: (name, when) =>
      `<p>ನಮಸ್ಕಾರ ${name},</p><p>ಧನ್ಯವಾದಗಳು — ನಿಮ್ಮ ಆದ್ಯತೆಯ ಸಮಯ <strong>${when}</strong> ದಾಖಲಿಸಲಾಗಿದೆ. ದೃಢೀಕರಣದ ನಂತರ ನಿಮಗೆ ಕ್ಯಾಲೆಂಡರ್ ಆಮಂತ್ರಣ ಬರುತ್ತದೆ.</p>`,
  },
};

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<Record<string, unknown>>;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private qualificationService: LeadQualificationService;

  constructor(
    private crmRepo: ICRMRepository,
    private bookingRepo: IBookingRepository,
    private knowledgeRepo: IKnowledgeRepository,
    private notificationService?: NotificationService,
    // Optional so existing tests can construct a registry without a calendar.
    // When absent, book_appointment captures the request as REQUESTED rather
    // than silently claiming a confirmed booking.
    private calcom?: CalcomAdapter,
    /** Platform-wide fallback from CALCOM_EVENT_TYPE_ID. The per-company
     * setting below takes precedence; this covers single-tenant deployments
     * that configure everything through the environment. */
    private calcomEventTypeId?: number,
    /** Lets a company's own Settings page drive the calendar and the email
     * sender name. Optional so existing tests can construct a registry
     * without one. */
    private settingsRepo?: ISettingsRepository,
    /** The RAG knowledge base (uploaded PDFs/DOCX/TXT, chunked and embedded)
     * already had a full admin pipeline — upload, index, status, an admin-only
     * search endpoint — but was never reachable from a live call: no tool
     * existed for the assistant to query it, so an admin could upload and
     * index a document and it would still never inform a single answer.
     * Optional so existing tests and deployments without a document store can
     * construct a registry without one. */
    private knowledgeDocumentRepo?: IKnowledgeDocumentRepository,
    private embeddingAdapter?: OpenAIEmbeddingAdapter
  ) {
    this.qualificationService = new LeadQualificationService(crmRepo);
    this.registerDefaultTools();
  }

  /** The Settings page writes calendar_settings.event_type_id and
   * email_settings.sender_name. Before this they were stored and never read,
   * so both fields looked configurable and changed nothing — the calendar
   * always used the env var and every email went out under the platform's own
   * name. A settings read failure degrades to the platform defaults rather
   * than failing the booking. */
  /** Public so the manual (non-voice) booking route can resolve the same
   * Cal.com event type a live call would use, without duplicating the
   * per-company-setting-then-platform-env-var fallback chain. */
  public async resolveCompanyDefaults(companyId: string): Promise<{ eventTypeId?: number; fromName?: string }> {
    if (!this.settingsRepo) return { eventTypeId: this.calcomEventTypeId };
    try {
      const settings = await this.settingsRepo.getSettings(companyId);
      const configuredId = Number((settings?.calendar_settings as Record<string, unknown> | undefined)?.event_type_id);
      const senderName = (settings?.email_settings as Record<string, unknown> | undefined)?.sender_name;
      return {
        eventTypeId: Number.isFinite(configuredId) && configuredId > 0 ? configuredId : this.calcomEventTypeId,
        fromName: typeof senderName === "string" && senderName.trim() ? senderName.trim() : undefined,
      };
    } catch (err) {
      Logger.warn("Could not load company settings for booking; using platform defaults", {
        companyId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { eventTypeId: this.calcomEventTypeId };
    }
  }

  /** Fires the cold-lead nurture email once per lead — guarded by the
   * caller passing `alreadyNurtured` (the lead's nurture_status BEFORE this
   * qualification write), so a lead that stays COLD across several
   * update_lead_qualification calls in the same conversation is never
   * emailed more than once. Fire-and-forget, matching every other
   * notification in this registry (book_appointment's confirmation email,
   * the high-value-lead alert): the tool call itself must not block or
   * fail on email delivery. */
  private maybeSendColdLeadNurtureEmail(
    scored: { id: string; name: string; email: string; lead_temperature?: LeadTemperature | null },
    alreadyNurtured: boolean,
    context: ToolContext
  ): void {
    if (scored.lead_temperature !== LeadTemperature.COLD || alreadyNurtured || !this.notificationService) return;
    const notificationService = this.notificationService;

    const send = async () => {
      const copy = NURTURE_EMAIL_COPY[context.language ?? "en"] ?? NURTURE_EMAIL_COPY.en;
      const employee = await this.knowledgeRepo.getEmployeeById(context.employeeId);
      if (!employee) return;
      const result = await notificationService.send({
        companyId: context.companyId,
        to: scored.email,
        subject: copy.subject,
        templateName: "cold_lead_nurture",
        html: copy.body(scored.name, employee.name),
      });
      await this.crmRepo.updateLeadQualification(scored.id, {
        nurture_status: result.success ? NurtureStatus.SENT : NurtureStatus.SKIPPED,
      });
    };

    send().catch((err) => Logger.error("Cold-lead nurture email failed", { error: err instanceof Error ? err.message : String(err) }));
  }

  /** Tool-call arguments come from an LLM, not a typed caller — a
   * hallucinated `decision_maker: "maybe"` (outside the declared enum) must
   * not silently reach Supabase as an unvalidated string. Validates the
   * qualification-signal subset of `args` against the same
   * `LeadQualificationSignalsSchema` used elsewhere at domain boundaries;
   * anything that fails validation is dropped (logged, not thrown) rather
   * than failing the whole tool call over one bad field. */
  private parseQualificationSignals(args: Record<string, unknown>) {
    const result = LeadQualificationSignalsSchema.safeParse(args);
    if (!result.success) {
      Logger.warn("Dropping invalid qualification signal(s) from a tool call", { issues: result.error.issues });
      return {};
    }
    return result.data;
  }

  private registerDefaultTools() {
    // 1. Save Lead Tool
    this.register({
      name: "save_lead",
      description:
        "Save a visitor's lead contact details once they share them. Include any qualification signals you've already learned naturally in conversation — decision authority, urgency, buying intent, objections, current solution, how they found this card. Never invent or guess a value the visitor didn't actually state; leave a field out if you don't know it yet. Call update_lead_qualification later if you learn more as the conversation continues.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Visitor full name" },
          email: { type: "string", description: "Visitor email address" },
          phone: { type: "string", description: "Visitor phone number" },
          business_name: { type: "string", description: "Company or business name" },
          industry: { type: "string", description: "Industry segment" },
          problem_statement: { type: "string", description: "Pain points expressed" },
          budget: { type: "number", description: "Estimated budget in USD" },
          timeline: { type: "string", description: "Project launch timeline" },
          ...QUALIFICATION_SIGNAL_PARAMETERS,
        },
        required: ["name", "email", "phone"],
      },
      execute: async (args, context) => {
        const leadFields = {
          company_id: context.companyId,
          employee_id: context.employeeId,
          conversation_id: context.conversationId,
          name: String(args.name),
          email: String(args.email),
          phone: String(args.phone),
          business_name: args.business_name ? String(args.business_name) : undefined,
          industry: args.industry ? String(args.industry) : undefined,
          problem_statement: args.problem_statement ? String(args.problem_statement) : undefined,
          budget: args.budget ? Number(args.budget) : undefined,
          timeline: args.timeline ? String(args.timeline) : undefined,
        };

        // Reuse the conversation's existing lead instead of inserting a second
        // row. get_next_qualification_question already creates a placeholder
        // lead for this conversation_id and appends the six recorded answers to
        // its qualification_notes; a fresh createLead here would orphan those
        // answers on the placeholder (leaving the reviewed, real-contact lead
        // showing none, and scoring/alerting the wrong row). Promote the
        // placeholder in place when it exists; otherwise create the lead.
        const existingLead = context.conversationId
          ? await this.crmRepo.getLeadByConversationId(context.conversationId).catch(() => null)
          : null;
        const lead = existingLead
          ? await this.crmRepo.updateLeadQualification(existingLead.id, {
              name: leadFields.name,
              email: leadFields.email,
              phone: leadFields.phone,
              business_name: leadFields.business_name,
              industry: leadFields.industry,
              problem_statement: leadFields.problem_statement,
              budget: leadFields.budget,
              timeline: leadFields.timeline,
            })
          : await this.crmRepo.createLead(leadFields);

        const signals = this.parseQualificationSignals(args);
        const scored = await this.qualificationService.calculateAndSaveLeadScore(lead.id, {
          budget: args.budget ? Number(args.budget) : undefined,
          timeline: args.timeline ? String(args.timeline) : undefined,
          hasNeed: Boolean(args.problem_statement),
          decisionMaker: signals.decision_maker,
          urgency: signals.urgency,
          buyingIntent: signals.buying_intent,
          objections: signals.objections,
          currentSolution: signals.current_solution,
          referralSource: signals.referral_source,
          sentiment: signals.sentiment,
          confidence: signals.qualification_confidence,
          conversationSummary: signals.conversation_summary,
          qualificationNotes: signals.qualification_notes,
        });

        if (scored.score_category === "HIGH" && this.notificationService) {
          const company = await this.knowledgeRepo.getCompanyById(context.companyId);
          const employee = await this.knowledgeRepo.getEmployeeById(context.employeeId);
          if (employee) {
            this.notificationService
              .send({
                companyId: context.companyId,
                to: employee.email,
                subject: `High-value lead: ${scored.name}`,
                templateName: "high_value_lead_alert",
                html: `<p>A high-value lead just came in via ${company?.name || "your AI voice card"}:</p><p><strong>${scored.name}</strong> (${scored.email}, ${scored.phone})<br/>Score: ${scored.score} — ${scored.score_reasoning}</p>`,
              })
              .catch((err) => Logger.error("High-value lead alert failed", { error: err instanceof Error ? err.message : String(err) }));
          }
        }

        // A brand-new lead can never have been nurtured before — no lookup
        // needed to know `alreadyNurtured` is false.
        this.maybeSendColdLeadNurtureEmail(scored, false, context);

        return {
          success: true,
          lead_id: lead.id,
          score: scored.score,
          score_category: scored.score_category,
          // Internal-only signal for the LLM to decide its own next move
          // (push toward booking vs. wind down warmly) — never phrase this
          // back to the visitor verbatim; see the sales/booking prompt
          // modules for how this is meant to be used.
          lead_temperature: scored.lead_temperature,
          message: "Lead contact details saved and qualified successfully.",
        };
      },
    });

    // 1b. Update Lead Qualification Tool — refines an already-saved lead as
    // the conversation naturally surfaces more (the "dynamic stage two":
    // deciding what to ask next based on what's still missing, rather than
    // working through a fixed question list). Re-scores from the merged
    // signals every time, so a lead that clarifies its budget mid-call can
    // move from COLD to WARM within the same conversation.
    this.register({
      name: "update_lead_qualification",
      description:
        "Record additional qualification signals for a lead you already saved with save_lead, as the conversation naturally surfaces them. Only include what the visitor actually said — never invent or infer a value to fill a gap. Re-scores the lead immediately.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "UUID returned by save_lead" },
          budget: { type: "number", description: "Estimated budget in USD, if newly learned or clarified" },
          timeline: { type: "string", description: "Project timeline, if newly learned or clarified" },
          has_need: {
            type: "boolean",
            description:
              "Whether the visitor has now confirmed (true) or explicitly ruled out (false) a genuine need — only set this if that has newly become clear; leave it out if unchanged.",
          },
          ...QUALIFICATION_SIGNAL_PARAMETERS,
        },
        required: ["lead_id"],
      },
      execute: async (args, context) => {
        const leadId = String(args.lead_id);
        const existing = await this.crmRepo.getLeadById(leadId);
        if (!existing) {
          return { success: false, message: "No lead found with that ID — call save_lead first." };
        }

        const alreadyNurtured =
          existing.nurture_status === NurtureStatus.QUEUED || existing.nurture_status === NurtureStatus.SENT;

        const signals = this.parseQualificationSignals(args);
        const scored = await this.qualificationService.calculateAndSaveLeadScore(leadId, {
          budget: args.budget !== undefined ? Number(args.budget) : existing.budget ?? undefined,
          timeline: args.timeline !== undefined ? String(args.timeline) : existing.timeline ?? undefined,
          hasNeed: args.has_need !== undefined ? Boolean(args.has_need) : existing.problem_statement ? true : undefined,
          decisionMaker: signals.decision_maker ?? existing.decision_maker ?? undefined,
          urgency: signals.urgency ?? existing.urgency ?? undefined,
          buyingIntent: signals.buying_intent ?? existing.buying_intent ?? undefined,
          objections: signals.objections ?? existing.objections ?? undefined,
          currentSolution: signals.current_solution ?? existing.current_solution ?? undefined,
          referralSource: signals.referral_source ?? existing.referral_source ?? undefined,
          sentiment: signals.sentiment ?? existing.sentiment ?? undefined,
          confidence: signals.qualification_confidence ?? existing.qualification_confidence ?? undefined,
          conversationSummary: signals.conversation_summary ?? existing.conversation_summary ?? undefined,
          // APPEND, never replace: qualification_notes is also where
          // get_next_qualification_question records each authored answer as
          // its own "Qn [YES|NO|MAYBE] (...): ..." line, which the booking
          // UI's qualification-status endpoint parses to render progress and
          // decide completion. The directive explicitly tells the model to
          // mirror accepted answers into THIS field ("perceived usefulness
          // -> notes") after every question — so on a real call this branch
          // fires routinely, not as an edge case. Replacing the whole column
          // with the model's own free-text summary silently destroyed every
          // previously-recorded Qn line, which is what made a call that
          // sounded complete end up rendering incomplete/stuck on screen.
          qualificationNotes: signals.qualification_notes
            ? existing.qualification_notes
              ? `${existing.qualification_notes}\n${signals.qualification_notes}`
              : signals.qualification_notes
            : existing.qualification_notes ?? undefined,
        });

        this.maybeSendColdLeadNurtureEmail(scored, alreadyNurtured, context);

        return {
          success: true,
          lead_id: leadId,
          score: scored.score,
          score_category: scored.score_category,
          lead_temperature: scored.lead_temperature,
          message: "Lead qualification updated.",
        };
      },
    });

    // 2. Book Appointment Tool
    this.register({
      name: "book_appointment",
      description: "Schedule a meeting/call between the visitor and the employee.",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "UUID of the saved lead" },
          start_time: { type: "string", description: "ISO 8601 string for appointment start time" },
          end_time: { type: "string", description: "ISO 8601 string for appointment end time" },
          timezone: {
            type: "string",
            description:
              "IANA timezone of the visitor's requested time (e.g. 'Asia/Kolkata'). Without it the booking is treated as UTC, so always supply the visitor's own timezone when known.",
          },
        },
        required: ["lead_id", "start_time", "end_time"],
      },
      execute: async (args, context) => {
        const [lead, companyDefaults] = await Promise.all([
          this.crmRepo.getLeadById(String(args.lead_id)),
          this.resolveCompanyDefaults(context.companyId),
        ]);

        // Attempt a REAL calendar booking first. Previously this wrote a row
        // and nothing else, then told the caller "Appointment successfully
        // scheduled" — no Cal.com event, no invite, nobody on the call.
        //
        // When Cal.com genuinely cannot book, the intent is still captured but
        // recorded as REQUESTED, and the message says a confirmation is coming
        // rather than claiming one already happened.
        let calcomBookingId: string | undefined;
        let meetingUrl: string | undefined;
        let confirmed = false;

        // Idempotency across invocations: a retried or duplicated tool call
        // (the model calling book_appointment twice for the same slot) must
        // NOT create a second real Cal.com event, a second appointment row,
        // and a second set of notifications. If this lead already holds a
        // non-cancelled appointment at the same start time, reuse it. (The
        // notification sends are separately idempotent per appointment id, so
        // reusing the row makes the whole operation a no-op on a repeat.)
        const startMs = Date.parse(String(args.start_time));
        const priorForLead = await this.bookingRepo
          .getAppointmentsByLead(String(args.lead_id))
          .catch(() => [] as Appointment[]);
        const duplicate = priorForLead.find(
          (a) => a.status !== AppointmentStatus.CANCELLED && Number.isFinite(startMs) && Date.parse(a.start_time) === startMs
        );

        let appointment: Appointment;
        if (duplicate) {
          appointment = duplicate;
          confirmed = duplicate.status === AppointmentStatus.BOOKED;
          calcomBookingId = duplicate.calcom_booking_id ?? undefined;
          meetingUrl = duplicate.meeting_url ?? undefined;
          Logger.warn("book_appointment: reusing existing appointment for this lead+slot (idempotent)", {
            appointmentId: duplicate.id,
          });
        } else {
          if (this.calcom && companyDefaults.eventTypeId) {
            try {
              const booking = await this.calcom.createBooking({
                eventTypeId: companyDefaults.eventTypeId,
                start: String(args.start_time),
                end: String(args.end_time),
                responses: { name: lead?.name ?? "Website visitor", email: lead?.email ?? "" },
                timeZone: String(args.timezone || "UTC"),
              });
              calcomBookingId = booking.uid;
              meetingUrl = booking.meetingUrl;
              // Trust Cal.com's own verdict, not merely "the call did not
              // throw". A "requires confirmation" event type returns the
              // booking as pending/awaiting_host — reporting that to the
              // visitor as an already-confirmed meeting would be a lie. Only a
              // non-pending status is treated as confirmed; anything else is
              // captured as REQUESTED.
              confirmed = !["pending", "awaiting_host"].includes(String(booking.status).toLowerCase());
            } catch (err) {
              // A calendar outage must not lose the lead's stated preference —
              // it downgrades to REQUESTED so a human can follow up.
              Logger.warn("Cal.com booking failed during voice call; capturing as REQUESTED", {
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }

          appointment = await this.bookingRepo.createAppointment({
            company_id: context.companyId,
            employee_id: context.employeeId,
            lead_id: String(args.lead_id),
            start_time: String(args.start_time),
            end_time: String(args.end_time),
            calcom_booking_id: calcomBookingId,
            meeting_url: meetingUrl,
            status: confirmed ? AppointmentStatus.BOOKED : AppointmentStatus.REQUESTED,
          });
        }

        // Both parties are notified from the SAME confirmed appointment, and
        // the sends are AWAITED (Promise.allSettled) rather than
        // fire-and-forget: a serverless instance can freeze the instant the
        // response returns, silently dropping unawaited promises — the same
        // reason the conversation-summary notifier awaits. Each send is
        // claimed through the webhook's insert-or-conflict idempotency
        // store, keyed appt-notify:{appointmentId}:{recipient}:{channel},
        // so a retried/duplicated execution can never double-message either
        // party. Every failure is logged and recorded on the lead timeline;
        // NONE of it can affect the booking result — the appointment stays
        // exactly as Cal.com decided it, and the visitor's confirmation UI
        // and voice are driven solely by `confirmed` below.
        const notifyOutcomes: Record<string, string> = {};
        try {
          const whatsapp = getWhatsAppNotifier();
          // Promise.resolve wrapper: a SYNCHRONOUS throw from the lookup
          // (broken repo wiring) must degrade to "no owner notifications",
          // never take the client's notifications down with it.
          const employee = await Promise.resolve()
            .then(() => this.knowledgeRepo.getEmployeeById(context.employeeId))
            .catch(() => null);
          const idempotency = new SupabaseWhatsAppIdempotencyStore();
          // At-LEAST-once bias — deliberately the opposite of the summary
          // notifier's: a booking confirmation is transactional, and a
          // silently LOST confirmation (claim store unreachable) is worse
          // for the client than a rare duplicate. A claim that positively
          // answers "already sent" still short-circuits; only claim ERRORS
          // fail open.
          const claimed = async (key: string) => {
            try {
              return await idempotency.claimMessage(key);
            } catch (err) {
              Logger.warn("book_appointment notification claim failed — sending anyway", { key, error: err instanceof Error ? err.message : String(err) });
              return true;
            }
          };

          const tz = String(args.timezone || "UTC");
          // ONE canonical formatted time for every channel — visitor's
          // locale AND requested timezone (the email previously formatted
          // without a timezone, silently showing server time).
          const when = new Date(appointment.start_time).toLocaleString(context.language || "en-US", {
            dateStyle: "full",
            timeStyle: "short",
            timeZone: tz,
          });

          const tasks: Array<Promise<void>> = [];

          // CLIENT email — localized, confirmed/requested variants (content
          // unchanged; see the multilingual note in APPOINTMENT_EMAIL_COPY).
          if (this.notificationService && lead) {
            const copy = APPOINTMENT_EMAIL_COPY[context.language ?? "en"] ?? APPOINTMENT_EMAIL_COPY.en;
            tasks.push(
              (async () => {
                if (!(await claimed(`appt-notify:${appointment.id}:client:email`))) return;
                const r = await this.notificationService!.send({
                  companyId: context.companyId,
                  to: lead.email,
                  subject: confirmed ? copy.confirmedSubject : copy.requestedSubject,
                  templateName: confirmed ? "appointment_confirmation" : "appointment_requested",
                  fromName: companyDefaults.fromName,
                  html: confirmed
                    ? copy.confirmedBody(lead.name, when, appointment.meeting_url ?? undefined)
                    : copy.requestedBody(lead.name, when),
                });
                notifyOutcomes["client:email"] = r.success ? "sent" : `failed:${r.error ?? "unknown"}`.slice(0, 80);
              })().catch((err) => {
                notifyOutcomes["client:email"] = "failed:exception";
                Logger.error("book_appointment client email failed", { error: err instanceof Error ? err.message : String(err) });
              })
            );
          }

          if (whatsapp.isConfigured()) {
            // CLIENT WhatsApp — on a REAL confirmation this is the canonical
            // three-part confirmation (the same approved wording the UI
            // shows and the voice speaks), plus the real meeting link when
            // one actually exists. REQUESTED keeps its honest non-confirmed
            // wording.
            if (lead?.phone) {
              const clientMsg = confirmed
                ? `${buildAppointmentConfirmedSpeech(`${when} (${tz})`)}${meetingUrl ? `\n\nMeeting: ${meetingUrl}` : ""}`
                : `Thanks — we've noted your preferred meeting time of ${when} (${tz}). A confirmation will follow shortly.`;
              tasks.push(
                (async () => {
                  if (!(await claimed(`appt-notify:${appointment.id}:client:whatsapp`))) return;
                  const r = await whatsapp.send(lead.phone!, clientMsg);
                  notifyOutcomes["client:whatsapp"] = r.sent ? "sent" : `failed:${r.reason ?? "unknown"}`;
                })().catch((err) => {
                  notifyOutcomes["client:whatsapp"] = "failed:exception";
                  Logger.warn("book_appointment client WhatsApp failed", { error: err instanceof Error ? err.message : String(err) });
                })
              );
            }

            // OWNER WhatsApp — operational summary of who booked and when.
            if (employee?.phone) {
              const ownerMsg = confirmed
                ? [
                    "Appointment Confirmed",
                    "",
                    `Client: ${lead?.name ?? "Website visitor"}`,
                    ...(lead?.email ? [`Email: ${lead.email}`] : []),
                    ...(lead?.phone ? [`Phone: ${lead.phone}`] : []),
                    `Preferred time: ${when} (${tz})`,
                    ...(meetingUrl ? [`Meeting: ${meetingUrl}`] : []),
                    "Status: CONFIRMED",
                  ].join("\n")
                : `New appointment REQUESTED: ${lead?.name ?? "Website visitor"}` +
                  `${lead?.phone ? ` (${lead.phone})` : ""}${lead?.email ? ` <${lead.email}>` : ""} — ${when} (${tz}). ` +
                  "Not yet on the calendar — follow up to confirm.";
              tasks.push(
                (async () => {
                  if (!(await claimed(`appt-notify:${appointment.id}:owner:whatsapp`))) return;
                  const r = await whatsapp.send(employee.phone, ownerMsg);
                  notifyOutcomes["owner:whatsapp"] = r.sent ? "sent" : `failed:${r.reason ?? "unknown"}`;
                })().catch((err) => {
                  notifyOutcomes["owner:whatsapp"] = "failed:exception";
                  Logger.warn("book_appointment owner WhatsApp failed", { error: err instanceof Error ? err.message : String(err) });
                })
              );
            }
          }

          // OWNER email — confirmed bookings only (an operational record,
          // not a client-facing artifact, so it stays English).
          if (this.notificationService && employee?.email && confirmed) {
            tasks.push(
              (async () => {
                if (!(await claimed(`appt-notify:${appointment.id}:owner:email`))) return;
                const r = await this.notificationService!.send({
                  companyId: context.companyId,
                  to: employee.email,
                  subject: `New appointment confirmed — ${lead?.name ?? "Website visitor"} — ${when}`,
                  templateName: "appointment_owner_confirmation",
                  fromName: companyDefaults.fromName,
                  html:
                    `<h2>Appointment Confirmed</h2>` +
                    `<p><strong>Client:</strong> ${lead?.name ?? "Website visitor"}</p>` +
                    (lead?.email ? `<p><strong>Email:</strong> ${lead.email}</p>` : "") +
                    (lead?.phone ? `<p><strong>Phone:</strong> ${lead.phone}</p>` : "") +
                    `<p><strong>Preferred time:</strong> ${when} (${tz})</p>` +
                    (meetingUrl ? `<p><strong>Meeting:</strong> <a href="${meetingUrl}">${meetingUrl}</a></p>` : "") +
                    `<p><strong>Status:</strong> CONFIRMED</p>`,
                });
                notifyOutcomes["owner:email"] = r.success ? "sent" : `failed:${r.error ?? "unknown"}`.slice(0, 80);
              })().catch((err) => {
                notifyOutcomes["owner:email"] = "failed:exception";
                Logger.error("book_appointment owner email failed", { error: err instanceof Error ? err.message : String(err) });
              })
            );
          }

          await Promise.allSettled(tasks);

          // Durable audit on the lead's own timeline (the same surface the
          // 24h reminder uses) — queryable evidence of exactly which
          // notifications went out for this appointment and which did not.
          if (lead && Object.keys(notifyOutcomes).length > 0) {
            try {
              await this.crmRepo.addActivity(lead.id, context.companyId, "NOTE", "appointment_notifications", undefined, {
                appointmentId: appointment.id,
                confirmed,
                outcomes: notifyOutcomes,
              });
            } catch (err) {
              Logger.warn("book_appointment notification audit failed", { error: err instanceof Error ? err.message : String(err) });
            }
          }
        } catch (err) {
          // Notification machinery must never touch the booking result.
          Logger.warn("book_appointment notifications block failed", { error: err instanceof Error ? err.message : String(err) });
        }

        return {
          success: true,
          appointment_id: appointment.id,
          status: appointment.status,
          confirmed,
          // Same deterministic mechanism as get_next_qualification_question's
          // completion (question 6): the exact closing line lives in its own
          // field the model is told to copy verbatim, rather than being embedded only in
          // prose the model has to reproduce from memory. Present ONLY on a
          // REAL confirmed booking (a real Cal.com event) — a REQUESTED
          // fallback (Cal.com couldn't complete a real slot, cancellation,
          // validation failure, etc.) must never get this field, since the
          // model has nothing to blindly copy and paraphrase into a false
          // confirmation.
          // The spoken confirmation includes the REAL booked slot, formatted
          // in the visitor's own requested timezone — never a recomputed or
          // default time.
          ...(confirmed
            ? {
                speak: buildAppointmentConfirmedSpeech(
                  new Date(appointment.start_time).toLocaleString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: String(args.timezone || "UTC"),
                  })
                ),
              }
            : {}),
          message: confirmed
            ? 'Appointment confirmed and a calendar invitation has been sent. SPEAK the "speak" text EXACTLY as ' +
              "returned, as your final words — do not paraphrase, shorten, lowercase, or rephrase it."
            : "Preferred time noted. A calendar slot could not be reserved automatically, but a follow-up will arrive by email shortly. Do NOT say the closing thank-you line yet — nothing is booked.",
        };
      },
    });

    // 2b. Qualification sequencing tool — the SERVER owns the authored
    // question order: exactly six questions, no gaps, no branching. It also
    // RECORDS each answer: question number, YES/NO/MAYBE, the English
    // transcript and a timestamp are appended to the lead's existing
    // qualification_notes field (no schema change), which is what the
    // qualification-status endpoint serves back to the booking UI.
    // Deliberately English-only and language-agnostic: this is the single
    // authoritative qualification script regardless of which language the
    // visitor's card/pitch experience is in (2026-08-13 product decision).
    this.register({
      name: "get_next_qualification_question",
      description:
        "REQUIRED after every visitor reply to a qualification question. The SERVER classifies the raw reply " +
        "as YES/NO/MAYBE (anything else returns a reprompt: stay on the same question), records accepted " +
        "answers, and returns the exact next authored question to speak verbatim; after the sixth question, " +
        "proceed to booking.",
      parameters: {
        type: "object",
        properties: {
          last_answered_question: {
            type: "number",
            description: "The authored number (1-6) of the question the visitor just replied to, or 0 before any answer.",
          },
          user_response: {
            type: "string",
            description: "The visitor's reply EXACTLY as heard — never cleaned up, translated or invented. The server classifies it; you never do.",
          },
          lead_id: {
            type: "string",
            description: "UUID from save_lead, ONLY if you already called it. Optional — the server resolves the lead for this call on its own otherwise.",
          },
        },
        required: ["last_answered_question"],
      },
      execute: async (args, context) => {
        const last = Number(args.last_answered_question);
        if (!Number.isInteger(last) || last < 0 || last > 6) {
          return { action: "error", message: "last_answered_question must be an integer 0-6." };
        }

        // The qualification language follows the visitor's selected card
        // language (carried into this context via the webhook's ?lang=
        // param). Only English and Tamil have authored sets; anything else
        // — including WhatsApp, whose channel passes no language — uses
        // English. The QUESTIONS and guidance are language-aware; the
        // PERSISTED record below stays canonical English either way.
        const qualificationLanguage = toQualificationLanguage(context.language);

        // SERVER-side closed-ended classification of the raw reply. The
        // model never classifies and never decides validity: anything that
        // is not clearly one of the accepted words for this language
        // (Yes/No/Maybe; Tamil: ஆம்/இல்லை/இருந்தாலும் + their standard
        // variants) is rejected — no answer is stored, the questionnaire
        // does not advance, and the model is told to re-speak the guidance
        // and listen to the SAME question.
        const classification = last > 0 ? classifyClosedResponse(String(args.user_response ?? ""), qualificationLanguage) : null;
        if (last > 0 && classification === null) {
          return {
            action: "reprompt",
            question_number: last,
            speak: getAnswerGuidance(qualificationLanguage),
            message:
              "The reply could not be classified as YES/NO/MAYBE — nothing was stored. Speak the guidance verbatim, " +
              "stay on the SAME question, and listen again. Do NOT advance.",
          };
        }

        // Resolve a lead SERVER-SIDE from the call's own conversation,
        // instead of trusting the model to already have a lead_id from
        // save_lead. save_lead structurally CANNOT succeed this early: its
        // schema requires name/email/phone, which the visitor only gives in
        // the booking form, long after (sometimes never, if they abandon
        // before booking) this closed-ended Q&A completes. Without this, the
        // model routinely never has a lead_id, and every answer classifies
        // correctly but silently fails to persist. A minimal placeholder
        // lead is created on first use and reused (via conversation_id, no
        // uniqueness constraint required) for the rest of the call;
        // save_lead later still runs normally once real contact details are
        // known.
        let leadId = args.lead_id ? String(args.lead_id) : undefined;
        if (!leadId && context.conversationId) {
          try {
            const existing = await this.crmRepo.getLeadByConversationId(context.conversationId);
            leadId = existing
              ? existing.id
              : (
                  await this.crmRepo.createLead({
                    company_id: context.companyId,
                    employee_id: context.employeeId,
                    conversation_id: context.conversationId,
                    name: "Voice qualification visitor",
                    email: `qualifying-${context.conversationId}@placeholder.maylaanai.internal`,
                    phone: "0000000000",
                  })
                ).id;
          } catch (err) {
            Logger.warn("get_next_qualification_question: lead resolution failed", { error: err instanceof Error ? err.message : String(err) });
          }
        }

        // Record the accepted answer on the lead's existing notes field:
        // "Qn [YES|NO|MAYBE] (ISO time): canonical English word" — the
        // English record is derived from the classification, never from
        // model-generated content, so nothing fabricated can be stored.
        // Read-modify-write append; a persistence hiccup must not stall
        // the conversation.
        //
        // Idempotency guard: a voice model can call this tool twice for the
        // same reply — a timeout-then-retry is a known LLM tool-calling
        // behavior, and the directive itself tells the model to keep
        // listening/reprompting on anything it isn't sure landed, which can
        // also produce a second call with the same last_answered_question.
        // Without this guard, each call independently reads-modifies-writes
        // the full notes string: two calls for the SAME question append two
        // "Qn [...]" lines (a duplicate the booking UI would render twice),
        // and two calls for DIFFERENT questions arriving close together can
        // race — both read the notes before either write lands, so the
        // second write silently overwrites the first and one answer is lost
        // even though the voice conversation itself kept advancing. This
        // was the actual cause of qualification progress that looked fine
        // in the live call but rendered incomplete/stuck in the booking UI.
        // A duplicate call for an already-recorded question is a genuine
        // no-op — never a fresh line, never a fresh classification query —
        // so a retry can never desync the record from what already exists.
        if (last > 0 && leadId && classification) {
          try {
            const lead = await this.crmRepo.getLeadById(leadId);
            if (lead && !new RegExp(`(^|\\n)Q${last} \\[`).test(lead.qualification_notes ?? "")) {
              const english = classification === "YES" ? "Yes" : classification === "NO" ? "No" : "Maybe";
              const line = `Q${last} [${classification}] (${new Date().toISOString()}): ${english}`;
              const notes = (lead.qualification_notes ? lead.qualification_notes + "\n" : "") + line;
              await this.crmRepo.updateLeadQualification(lead.id, { qualification_notes: notes });
            }
          } catch (err) {
            Logger.warn("get_next_qualification_question: answer record failed", { error: err instanceof Error ? err.message : String(err) });
          }
        }

        const ask = (n: number) => {
          const q = getAuthoredQuestion(n, qualificationLanguage);
          return q
            ? {
                action: "ask_verbatim",
                question_number: q.number,
                question: q.question,
                speak: withAnswerGuidance(q.question, getAnswerGuidance(qualificationLanguage)),
              }
            : { action: "error", message: `No authored question ${n}.` };
        };

        // Exactly six questions, straight sequence, no gaps, no branching,
        // no scoring gate — qualification completion is decoupled from lead
        // scoring (calculateAndSaveLeadScore, triggered separately by
        // save_lead/update_lead_qualification, remains the only place
        // HOT/WARM/COLD is computed; it is informational for internal
        // reporting only and never blocks or reroutes this sequence).
        if (last < 6) return ask(last + 1);
        return {
          action: "complete_proceed_to_booking",
          speak: getContinuePrompt(qualificationLanguage),
          message:
            "All six questions are complete. SPEAK the 'speak' text EXACTLY as returned — do not paraphrase it. The " +
            "on-screen Continue button is already visible; the visitor picks a time and enters their details " +
            "there. The appointment is NOT booked yet — never say it's confirmed until they've actually done that.",
        };
      },
    });

    // 3. Search Products Tool
    this.register({
      name: "search_products",
      description: "Search company product catalog for features, pricing, and benefits.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Product keyword or feature search" },
        },
        required: ["query"],
      },
      execute: async (args, context) => {
        const products = await this.knowledgeRepo.searchProducts(context.companyId, String(args.query));
        return {
          success: true,
          products: products.map((p) => ({
            name: p.name,
            description: p.description,
            price: p.pricing,
            currency: p.currency,
            features: p.features,
          })),
        };
      },
    });

    // 4. Search Services Tool
    this.register({
      name: "search_services",
      description: "Get detailed deliverables, timelines, and pricing for services offered.",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async (_, context) => {
        const services = await this.knowledgeRepo.getServicesByCompany(context.companyId);
        return {
          success: true,
          services: services.map((s) => ({
            name: s.name,
            description: s.description,
            price: s.price,
            timeline: s.timeline,
            deliverables: s.deliverables,
          })),
        };
      },
    });

    // 5. Search FAQs Tool
    this.register({
      name: "search_faqs",
      description: "Search specific FAQs when exact details or company policies are requested.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
      execute: async (args, context) => {
        const faqs = await this.knowledgeRepo.searchFAQs(context.companyId, String(args.query));
        return { success: true, results: faqs.map((f) => ({ question: f.question, answer: f.answer })) };
      },
    });

    // 5b. Search Knowledge Base Tool — the RAG documents an admin uploads on
    // the Knowledge Base page (contracts, policy PDFs, pricing sheets, etc.),
    // distinct from the short structured FAQ table search_faqs covers.
    this.register({
      name: "search_knowledge_base",
      description:
        "Search uploaded company documents (policies, contracts, detailed guides) for information not covered by products, services, or FAQs.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to look for in the company's uploaded documents" },
        },
        required: ["query"],
      },
      execute: async (args, context) => {
        if (!this.knowledgeDocumentRepo) {
          return { success: false, message: "No knowledge base is configured for this company." };
        }
        const query = String(args.query);
        try {
          const chunks =
            this.embeddingAdapter?.isConfigured()
              ? await this.knowledgeDocumentRepo.searchByVector(context.companyId, (await this.embeddingAdapter.embed([query]))[0])
              : await this.knowledgeDocumentRepo.searchByText(context.companyId, query);

          return {
            success: true,
            results: chunks.map((c) => ({ content: c.content })),
          };
        } catch (err) {
          // A document-store outage must degrade to "I don't have that on
          // file" for the visitor, not crash the whole tool call — the
          // assistant still has products/services/FAQs to fall back on.
          Logger.warn("search_knowledge_base failed", { error: err instanceof Error ? err.message : String(err) });
          return { success: false, message: "Could not search the knowledge base right now." };
        }
      },
    });

    // 6. Get Company Information Tool
    this.register({
      name: "get_company_information",
      description: "Fetch general company profile, website, and office address.",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async (_, context) => {
        const company = await this.knowledgeRepo.getCompanyById(context.companyId);
        return {
          success: true,
          company: company
            ? { name: company.name, website: company.website }
            : { message: "Company details loaded." },
        };
      },
    });

    // 7. Get Employee Information Tool
    this.register({
      name: "get_employee_information",
      description: "Fetch digital twin employee designation, office address, and working hours.",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async (_, context) => {
        const employee = await this.knowledgeRepo.getEmployeeById(context.employeeId);
        return {
          success: true,
          employee: employee
            ? {
                name: employee.name,
                designation: employee.designation,
                email: employee.email,
                phone: employee.phone,
                office: employee.office_address,
                working_hours: employee.working_hours,
              }
            : { message: "Employee details loaded." },
        };
      },
    });
  }

  public register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public getAllToolDefinitions() {
    return Array.from(this.tools.values()).map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
}
