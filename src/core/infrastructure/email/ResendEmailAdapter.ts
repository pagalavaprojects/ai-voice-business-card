import { isPlaceholderCredential } from "@/shared/lib/security";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
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
        from: "AI Voice Business Card <notifications@voicecard.ai>",
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
