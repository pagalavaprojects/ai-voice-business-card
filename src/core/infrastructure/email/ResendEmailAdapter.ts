import { isPlaceholderCredential } from "@/shared/lib/security";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  /** The company's configured sender name (Settings → Email Sender Name).
   * Optional so a caller with no company context still sends. */
  fromName?: string;
}

/** The address half of the From header. Must be a domain verified with Resend,
 * so it is deployment configuration, not a per-company setting — a tenant
 * cannot make us send as a domain we don't control. The name half IS
 * per-company, which is the part an admin actually wants to change. */
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "notifications@voicecard.ai";
const DEFAULT_FROM_NAME = "AI Voice Business Card";

/** Strips the characters that would let a configured name break out of the
 * From header into extra addresses or headers. */
function sanitizeFromName(raw: string | undefined): string {
  const cleaned = (raw ?? "")
    .replace(/[<>@",;\r\n]/g, " ")
    // Collapse the gaps the substitution leaves behind, so a sanitised name
    // still reads as a name in the recipient's inbox.
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || DEFAULT_FROM_NAME;
}

export class ResendEmailAdapter {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.RESEND_API_KEY || "";
  }

  async sendEmail(options: SendEmailOptions): Promise<{ id: string; success: boolean }> {
    if (isPlaceholderCredential(this.apiKey)) {
      console.log(`[Resend Email Simulated] To: ${options.to} | Subject: ${options.subject}`);
      return { id: `sim_msg_${Date.now()}`, success: true };
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        from: `${sanitizeFromName(options.fromName)} <${FROM_ADDRESS}>`,
        to: [options.to],
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ResendEmailAdapter failed: ${response.status} ${errorText}`);
    }

    const json = await response.json();
    return { id: json.id, success: true };
  }
}
