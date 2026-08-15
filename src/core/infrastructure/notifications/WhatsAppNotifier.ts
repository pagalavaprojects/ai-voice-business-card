import { Logger } from "@/shared/lib/logger";

/**
 * Automated WhatsApp messaging — the real thing, not the card's wa.me deep
 * links (those just open the visitor's own WhatsApp app; nothing is ever
 * sent by the platform through them).
 *
 * Ships fully code-ready but inert until real Meta WhatsApp Cloud API
 * credentials exist:
 *
 *   WHATSAPP_ACCESS_TOKEN     — a (system-user) access token from
 *                               developers.facebook.com → WhatsApp → API Setup
 *   WHATSAPP_PHONE_NUMBER_ID  — the sender phone-number ID from the same page
 *   WHATSAPP_TEMPLATE_NAME    — optional: an APPROVED template's name. Meta
 *                               only allows business-initiated messages
 *                               outside a 24h customer-service window via
 *                               approved templates, so without one this
 *                               notifier can only reliably reach numbers
 *                               that have messaged the business first.
 *
 * Unconfigured (or placeholder-valued) credentials make isConfigured()
 * false and send() a logged no-op that reports {sent:false} — a booking
 * must never fail, retry, or slow down because messaging isn't set up.
 */
export interface WhatsAppSendResult {
  sent: boolean;
  reason?: string;
}

export interface IWhatsAppNotifier {
  isConfigured(): boolean;
  /** `to` is an international number; non-digits are stripped (wa.me
   * convention this app already uses). Returns rather than throws — a
   * notification is never worth failing its triggering operation. */
  send(to: string, body: string): Promise<WhatsAppSendResult>;
}

function isPlaceholder(value: string | undefined): boolean {
  return !value || /your-|placeholder|example|xxxx/i.test(value);
}

export class MetaCloudWhatsAppNotifier implements IWhatsAppNotifier {
  constructor(
    private accessToken = process.env.WHATSAPP_ACCESS_TOKEN,
    private phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID,
    private templateName = process.env.WHATSAPP_TEMPLATE_NAME,
    /** Injectable for tests; defaults to global fetch. */
    private fetchImpl: typeof fetch = fetch
  ) {}

  isConfigured(): boolean {
    return !isPlaceholder(this.accessToken) && !isPlaceholder(this.phoneNumberId);
  }

  async send(to: string, body: string): Promise<WhatsAppSendResult> {
    if (!this.isConfigured()) {
      return { sent: false, reason: "unconfigured" };
    }
    const digits = to.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      return { sent: false, reason: "invalid_recipient" };
    }

    // An approved template (when named) is the only Meta-sanctioned way to
    // open a business-initiated conversation; plain text works only inside
    // an existing 24h customer-service window. The template is assumed to
    // take the full message as its single {{1}} body parameter.
    const payload = !isPlaceholder(this.templateName)
      ? {
          messaging_product: "whatsapp",
          to: digits,
          type: "template",
          template: {
            name: this.templateName,
            language: { code: "en" },
            components: [{ type: "body", parameters: [{ type: "text", text: body }] }],
          },
        }
      : { messaging_product: "whatsapp", to: digits, type: "text", text: { body } };

    try {
      const res = await this.fetchImpl(`https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        // templateConfigured makes the most common production failure
        // self-diagnosing: a 4xx WITHOUT a template almost always means the
        // recipient is outside Meta's 24h customer-service window, which
        // only an approved template can cross. Names/booleans only — never
        // credential values.
        Logger.warn("WhatsApp send failed", {
          status: res.status,
          body: errBody.slice(0, 300),
          templateConfigured: !isPlaceholder(this.templateName),
        });
        return { sent: false, reason: `http_${res.status}` };
      }
      return { sent: true };
    } catch (err) {
      Logger.warn("WhatsApp send errored", { error: err instanceof Error ? err.message : String(err) });
      return { sent: false, reason: "network_error" };
    }
  }
}

let sharedNotifier: IWhatsAppNotifier | null = null;

/** Process-wide instance, mirroring how the email NotificationService is
 * wired. Always returns a notifier — callers just get {sent:false,
 * reason:"unconfigured"} until real credentials exist, so call sites need
 * no conditional plumbing. */
export function getWhatsAppNotifier(): IWhatsAppNotifier {
  if (!sharedNotifier) sharedNotifier = new MetaCloudWhatsAppNotifier();
  return sharedNotifier;
}
