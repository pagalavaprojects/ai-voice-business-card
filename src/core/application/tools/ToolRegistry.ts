import { ICRMRepository } from "../../domain/repositories/ICRMRepository";
import { IBookingRepository } from "../../domain/repositories/IBookingRepository";
import { IKnowledgeRepository } from "../../domain/repositories/IKnowledgeRepository";
import { NotificationService } from "../services/NotificationService";
import { LeadQualificationService } from "../services/LeadQualificationService";
import { CalcomAdapter } from "../../infrastructure/booking/calcom/CalcomAdapter";
import { ISettingsRepository } from "../../domain/repositories/ISettingsRepository";
import { IKnowledgeDocumentRepository } from "../../domain/repositories/IKnowledgeDocumentRepository";
import { OpenAIEmbeddingAdapter } from "../../infrastructure/embeddings/OpenAIEmbeddingAdapter";
import { AppointmentStatus } from "../../domain/models/types";
import { Logger } from "@/shared/lib/logger";

export const KNOWN_TOOL_NAMES = [
  "save_lead",
  "book_appointment",
  "search_products",
  "search_services",
  "search_faqs",
  "search_knowledge_base",
  "get_company_information",
  "get_employee_information",
] as const;

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

  private registerDefaultTools() {
    // 1. Save Lead Tool
    this.register({
      name: "save_lead",
      description: "Save or update a visitor's lead contact details once they express interest or share their information.",
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
        },
        required: ["name", "email", "phone"],
      },
      execute: async (args, context) => {
        const lead = await this.crmRepo.createLead({
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
        });

        const scored = await this.qualificationService.calculateAndSaveLeadScore(lead.id, {
          budget: args.budget ? Number(args.budget) : undefined,
          timeline: args.timeline ? String(args.timeline) : undefined,
          hasNeed: Boolean(args.problem_statement),
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

        return {
          success: true,
          lead_id: lead.id,
          score: scored.score,
          score_category: scored.score_category,
          message: "Lead contact details saved and qualified successfully.",
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
            confirmed = true;
          } catch (err) {
            // A calendar outage must not lose the lead's stated preference —
            // it downgrades to REQUESTED so a human can follow up.
            Logger.warn("Cal.com booking failed during voice call; capturing as REQUESTED", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const appointment = await this.bookingRepo.createAppointment({
          company_id: context.companyId,
          employee_id: context.employeeId,
          lead_id: String(args.lead_id),
          start_time: String(args.start_time),
          end_time: String(args.end_time),
          calcom_booking_id: calcomBookingId,
          meeting_url: meetingUrl,
          status: confirmed ? AppointmentStatus.BOOKED : AppointmentStatus.REQUESTED,
        });

        // The email must match reality too — telling someone a meeting is
        // confirmed when no calendar entry exists is the same lie in a
        // different channel. The email ITSELF must also match the visitor's
        // own conversation language — a Tamil caller who booked in Tamil
        // getting an all-English confirmation is the same class of leak the
        // rest of this platform's multilingual work exists to close.
        if (this.notificationService && lead) {
          const copy = APPOINTMENT_EMAIL_COPY[context.language ?? "en"] ?? APPOINTMENT_EMAIL_COPY.en;
          const when = new Date(appointment.start_time).toLocaleString(context.language || "en-US", {
            dateStyle: "full",
            timeStyle: "short",
          });
          this.notificationService
            .send({
              companyId: context.companyId,
              to: lead.email,
              subject: confirmed ? copy.confirmedSubject : copy.requestedSubject,
              templateName: confirmed ? "appointment_confirmation" : "appointment_requested",
              fromName: companyDefaults.fromName,
              html: confirmed
                ? copy.confirmedBody(lead.name, when, appointment.meeting_url ?? undefined)
                : copy.requestedBody(lead.name, when),
            })
            .catch((err) => Logger.error("book_appointment email failed", { error: err instanceof Error ? err.message : String(err) }));
        }

        return {
          success: true,
          appointment_id: appointment.id,
          status: appointment.status,
          confirmed,
          // What the assistant says to the caller. It must not promise a
          // calendar entry that was never created.
          message: confirmed
            ? "Appointment confirmed and a calendar invitation has been sent."
            : "Preferred time noted. A confirmation will follow shortly by email.",
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
