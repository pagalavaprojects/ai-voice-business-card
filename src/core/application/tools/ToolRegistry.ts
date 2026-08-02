import { ICRMRepository } from "../../domain/repositories/ICRMRepository";
import { IBookingRepository } from "../../domain/repositories/IBookingRepository";
import { IKnowledgeRepository } from "../../domain/repositories/IKnowledgeRepository";
import { NotificationService } from "../services/NotificationService";
import { LeadQualificationService } from "../services/LeadQualificationService";
import { CalcomAdapter } from "../../infrastructure/booking/calcom/CalcomAdapter";
import { AppointmentStatus } from "../../domain/models/types";
import { Logger } from "@/shared/lib/logger";

export const KNOWN_TOOL_NAMES = [
  "save_lead",
  "book_appointment",
  "search_products",
  "search_services",
  "search_faqs",
  "get_company_information",
  "get_employee_information",
] as const;

export interface ToolContext {
  companyId: string;
  employeeId: string;
  conversationId?: string;
}

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
    private calcomEventTypeId?: number
  ) {
    this.qualificationService = new LeadQualificationService(crmRepo);
    this.registerDefaultTools();
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
        const lead = await this.crmRepo.getLeadById(String(args.lead_id));

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

        if (this.calcom && this.calcomEventTypeId) {
          try {
            const booking = await this.calcom.createBooking({
              eventTypeId: this.calcomEventTypeId,
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
        // different channel.
        if (this.notificationService && lead) {
          const when = new Date(appointment.start_time).toLocaleString();
          this.notificationService
            .send({
              companyId: context.companyId,
              to: lead.email,
              subject: confirmed ? "Your meeting is confirmed" : "We've received your meeting request",
              templateName: confirmed ? "appointment_confirmation" : "appointment_requested",
              html: confirmed
                ? `<p>Hi ${lead.name},</p><p>Your meeting is confirmed for <strong>${when}</strong>.</p>${
                    appointment.meeting_url ? `<p><a href="${appointment.meeting_url}">Join the meeting</a></p>` : ""
                  }`
                : `<p>Hi ${lead.name},</p><p>Thanks — we've noted your preferred time of <strong>${when}</strong>. You'll receive a calendar invitation once it's confirmed.</p>`,
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
