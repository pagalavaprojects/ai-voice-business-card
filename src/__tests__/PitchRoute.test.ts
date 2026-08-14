/**
 * Route-level tests for GET /api/public/{companyId}/{employeeId}/pitch.
 *
 * composePitchScript's own language/type correctness is proven in
 * PitchScripts.test.ts against real data — this file proves the ROUTE'S
 * OWN wiring instead: that the query params actually reach the composer,
 * that the storage cache key can never collide across language/type/
 * company/employee (the exact bug class that would let English audio get
 * served back for a Tamil request), and that a TTS failure degrades to an
 * honest 503 rather than a fabricated response — the layer directly
 * responsible for the "temporarily unavailable" response this project's
 * production Tamil AND English pitches are currently both hitting because
 * the upstream OpenAI account has no credits (a billing/operator issue,
 * not a routing defect — this file is what proves it ISN'T a routing
 * defect).
 */
const getCompanyById = jest.fn();
const getEmployeeById = jest.fn();
const getServicesByCompany = jest.fn();
const getProductsByCompany = jest.fn();
const download = jest.fn();
const ensureBucket = jest.fn();
const upload = jest.fn();
const checkRateLimitDistributed = jest.fn();

jest.mock("@/core/infrastructure/database/supabase/SupabaseKnowledgeRepository", () => ({
  SupabaseKnowledgeRepository: jest.fn().mockImplementation(() => ({
    getCompanyById: (...args: unknown[]) => getCompanyById(...args),
    getEmployeeById: (...args: unknown[]) => getEmployeeById(...args),
    getServicesByCompany: (...args: unknown[]) => getServicesByCompany(...args),
    getProductsByCompany: (...args: unknown[]) => getProductsByCompany(...args),
  })),
}));

jest.mock("@/core/infrastructure/storage/SupabaseStorageAdapter", () => ({
  SupabaseStorageAdapter: jest.fn().mockImplementation(() => ({
    ensureBucket: (...args: unknown[]) => ensureBucket(...args),
    upload: (...args: unknown[]) => upload(...args),
  })),
}));

jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: { storage: { from: () => ({ download: (...args: unknown[]) => download(...args) }) } },
}));

jest.mock("@/shared/lib/rateLimit", () => ({
  checkRateLimitDistributed: (...args: unknown[]) => checkRateLimitDistributed(...args),
}));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/public/[companyId]/[employeeId]/pitch/route";

const COMPANY_ID = "company-1";
const EMPLOYEE_ID = "employee-1";

function req(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/public/${COMPANY_ID}/${EMPLOYEE_ID}/pitch?${qs}`);
}

describe("GET /api/public/{companyId}/{employeeId}/pitch", () => {
  const ORIGINAL_ENV = process.env;
  const ORIGINAL_FETCH = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV, OPENAI_API_KEY: "sk-real-test-key-1234567890" };
    checkRateLimitDistributed.mockResolvedValue({ allowed: true });
    getCompanyById.mockResolvedValue({ id: COMPANY_ID, name: "Pagalava Data Analytics", website: "https://pagalava.com" });
    getEmployeeById.mockResolvedValue({ id: EMPLOYEE_ID, company_id: COMPANY_ID, name: "Srinivasan Kandasamy", designation: "Founder", is_active: true });
    getServicesByCompany.mockResolvedValue([{ name: "AI Voice Business Cards", description: "Replace static cards." }]);
    getProductsByCompany.mockResolvedValue([]);
    download.mockResolvedValue({ data: null, error: { message: "not found" } }); // no cached copy by default
    ensureBucket.mockResolvedValue(undefined);
    upload.mockResolvedValue("uploaded");
    // Safe default so a test that doesn't care about the TTS path never
    // makes a REAL network call to OpenAI with the fake key above — a real
    // defect caught while writing this file (several cases below fell
    // through to a live fetch() before this default was added). Tests that
    // exercise the TTS path explicitly override this per-test.
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "fetch not mocked for this test" }) as unknown as typeof fetch;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
  });

  it("400s an unknown pitch type before touching the database", async () => {
    const res = await GET(req("type=nonsense&lang=en"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });
    expect(res.status).toBe(400);
    expect(getCompanyById).not.toHaveBeenCalled();
  });

  describe("?format=script — proves the language/type reach the composer, independent of TTS", () => {
    it("returns the English script for lang=en", async () => {
      const res = await GET(req("type=elevator&lang=en&format=script"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });
      const body = await res.json();
      expect(body.language).toBe("en");
      expect(body.script).toContain("Srinivasan Kandasamy");
      expect(body.script).toMatch(/Hello/);
    });

    it("returns the Tamil script for lang=ta — a different script from English, not a fallback to it", async () => {
      const res = await GET(req("type=elevator&lang=ta&format=script"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });
      const body = await res.json();
      expect(body.language).toBe("ta");
      expect(body.script).toMatch(/வணக்கம்/);
      expect(body.script).not.toMatch(/Hello/);
    });

    it("an unsupported lang value falls back to the platform default rather than 500ing", async () => {
      const res = await GET(req("type=elevator&lang=xx&format=script"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.language).not.toBe("xx");
    });

    it("elevator, product, and usp for the same language return three genuinely different scripts", async () => {
      const [elevator, product, usp] = await Promise.all(
        ["elevator", "product", "usp"].map(async (type) => {
          const res = await GET(req(`type=${type}&lang=ta&format=script`), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });
          return (await res.json()).script as string;
        })
      );
      expect(new Set([elevator, product, usp]).size).toBe(3);
    });
  });

  describe("storage cache key — must isolate language and type; this is the exact bug class that would let cached English audio answer a Tamil request", () => {
    it("looks up a storage path that embeds the type and the language, not just the company/employee", async () => {
      await GET(req("type=elevator&lang=ta"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });
      expect(download).toHaveBeenCalledTimes(1);
      const [path] = download.mock.calls[0];
      expect(path).toContain(COMPANY_ID);
      expect(path).toContain(EMPLOYEE_ID);
      expect(path).toContain("elevator.ta.");
    });

    it("en and ta requests for the same type resolve to different storage paths", async () => {
      await GET(req("type=elevator&lang=en"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });
      const enPath = download.mock.calls[0][0];
      download.mockClear();
      await GET(req("type=elevator&lang=ta"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });
      const taPath = download.mock.calls[0][0];
      expect(enPath).not.toBe(taPath);
    });

    it("elevator and product for the same language resolve to different storage paths", async () => {
      await GET(req("type=elevator&lang=ta"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });
      const elevatorPath = download.mock.calls[0][0];
      download.mockClear();
      await GET(req("type=product&lang=ta"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });
      const productPath = download.mock.calls[0][0];
      expect(elevatorPath).not.toBe(productPath);
    });

    it("the SAME type/language for two different company/employee pairs resolve to different storage paths — the full cache key is company+employee+type+language, not just type+language", async () => {
      await GET(req("type=elevator&lang=ta"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });
      const path1 = download.mock.calls[0][0];
      download.mockClear();

      // employee.company_id must match the requested companyId for the
      // route's visibility check to pass — override just this call.
      getEmployeeById.mockResolvedValueOnce({ id: EMPLOYEE_ID, company_id: "company-2", name: "Srinivasan Kandasamy", designation: "Founder", is_active: true });
      await GET(req("type=elevator&lang=ta"), { params: { companyId: "company-2", employeeId: EMPLOYEE_ID } });
      const path2 = download.mock.calls[0][0];
      download.mockClear();

      await GET(req("type=elevator&lang=ta"), { params: { companyId: COMPANY_ID, employeeId: "employee-2" } });
      const path3 = download.mock.calls[0][0];

      expect(path1).toContain(COMPANY_ID);
      expect(path2).toContain("company-2");
      expect(path3).toContain("employee-2");
      expect(new Set([path1, path2, path3]).size).toBe(3);
    });

    it("a cache hit is served directly and never calls OpenAI", async () => {
      download.mockResolvedValue({ data: { arrayBuffer: async () => new TextEncoder().encode("cached-mp3-bytes").buffer }, error: null });
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as unknown as typeof fetch;

      const res = await GET(req("type=elevator&lang=ta"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("TTS failure — the actual production behavior right now (OpenAI account exhausted), proven honest rather than fabricated", () => {
    it("a failed OpenAI render returns 503 with an honest message, not a fabricated audio response", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "insufficient_quota" }) as unknown as typeof fetch;

      const res = await GET(req("type=elevator&lang=ta"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.message).toBe("Voice pitch temporarily unavailable");
      expect(upload).not.toHaveBeenCalled();
    });

    it("behaves identically for English — the TTS failure is not language-specific", async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "insufficient_quota" }) as unknown as typeof fetch;

      const res = await GET(req("type=elevator&lang=en"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.message).toBe("Voice pitch temporarily unavailable");
    });

    it("reports unconfigured (not just 'unavailable') when OPENAI_API_KEY is a placeholder", async () => {
      process.env = { ...ORIGINAL_ENV, OPENAI_API_KEY: "your-openai-api-key-placeholder" };
      const res = await GET(req("type=elevator&lang=ta"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.message).toBe("Voice pitch service not configured");
    });
  });

  it("a successful fresh render persists to storage at the same cache key it will later be looked up by", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new TextEncoder().encode("fresh-mp3-bytes").buffer }) as unknown as typeof fetch;

    const res = await GET(req("type=usp&lang=ta"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });

    expect(res.status).toBe(200);
    expect(upload).toHaveBeenCalledTimes(1);
    const [, uploadPath] = upload.mock.calls[0];
    const [, downloadPath] = [null, download.mock.calls[0][0]];
    expect(uploadPath).toBe(downloadPath);
  });

  it("404s when the employee card is not visible (is_active: false), independent of language", async () => {
    getEmployeeById.mockResolvedValue({ id: EMPLOYEE_ID, company_id: COMPANY_ID, name: "X", designation: "Y", is_active: false });
    const res = await GET(req("type=elevator&lang=ta"), { params: { companyId: COMPANY_ID, employeeId: EMPLOYEE_ID } });
    expect(res.status).toBe(404);
  });
});
