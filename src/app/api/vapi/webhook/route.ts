import { NextRequest, NextResponse } from "next/server";
import { formatApiResponse, validateVapiWebhookSignature } from "@/shared/lib/security";
import { SupabaseKnowledgeRepository } from "@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository";
import { SupabasePromptRepository } from "@/core/infrastructure/database/supabase/SupabasePromptRepository";
import { SupabaseCRMRepository } from "@/core/infrastructure/database/supabase/SupabaseCRMRepository";
import { SupabaseBookingRepository } from "@/core/infrastructure/database/supabase/SupabaseBookingRepository";
import { PromptAssemblyService } from "@/core/application/services/PromptAssemblyService";
import { ToolRegistry } from "@/core/application/tools/ToolRegistry";
import { Logger } from "@/shared/lib/logger";

const knowledgeRepo = new SupabaseKnowledgeRepository();
const promptRepo = new SupabasePromptRepository();
const crmRepo = new SupabaseCRMRepository();
const bookingRepo = new SupabaseBookingRepository();

const promptAssemblyService = new PromptAssemblyService(knowledgeRepo, promptRepo);
const toolRegistry = new ToolRegistry(crmRepo, bookingRepo, knowledgeRepo);

export async function POST(req: NextRequest) {
  try {
    if (!validateVapiWebhookSignature(req)) {
      return formatApiResponse(null, 401, "Unauthorized: Invalid webhook secret", ["Invalid signature"]);
    }

    const payload = await req.json();
    const { message } = payload;

    if (!message) {
      return formatApiResponse(null, 400, "Missing message object in payload");
    }

    // 1. Handle Vapi Assistant Request (Dynamic Prompt Assembly)
    if (message.type === "assistant-request") {
      const companyId = message.call?.customer?.extension || req.nextUrl.searchParams.get("companyId");
      const employeeId = req.nextUrl.searchParams.get("employeeId");

      if (!companyId || !employeeId) {
        return formatApiResponse(null, 400, "companyId and employeeId query params are required");
      }

      const systemPrompt = await promptAssemblyService.assembleSystemPrompt(companyId, employeeId);
      const tools = toolRegistry.getAllToolDefinitions();

      return NextResponse.json({
        assistant: {
          firstMessage: "Hello! Thank you for scanning my business card. How can I help you today?",
          model: {
            provider: "openai",
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
            ],
            tools,
          },
        },
      });
    }

    // 2. Handle Function / Tool Calls
    if (message.type === "tool-calls") {
      const toolCall = message.toolCalls?.[0];
      if (!toolCall) {
        return formatApiResponse(null, 400, "No tool call provided");
      }

      const { name, arguments: args } = toolCall.function;
      const tool = toolRegistry.getTool(name);

      if (!tool) {
        return formatApiResponse(null, 404, `Tool '${name}' not found`);
      }

      const companyId = req.nextUrl.searchParams.get("companyId") || "";
      const employeeId = req.nextUrl.searchParams.get("employeeId") || "";
      const conversationId = message.call?.id;

      const result = await tool.execute(args, { companyId, employeeId, conversationId });

      return NextResponse.json({
        results: [
          {
            toolCallId: toolCall.id,
            result: JSON.stringify(result),
          },
        ],
      });
    }

    // 3. Handle End of Call Report
    if (message.type === "end-of-call-report") {
      Logger.info("Vapi call ended", { callId: message.call?.id, summary: message.analysis?.summary });
      return formatApiResponse({ status: "processed" }, 200, "Call report acknowledged");
    }

    return formatApiResponse({ status: "ignored" }, 200, "Event type acknowledged but not processed");
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown server error";
    Logger.error("Vapi Webhook Error", { error: errorMessage });
    return formatApiResponse(null, 500, "Internal Server Error", [errorMessage]);
  }
}
