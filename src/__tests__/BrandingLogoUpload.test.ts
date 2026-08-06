/**
 * Regression test for a real gap: uploading a logo via the Settings page
 * wrote branding.logo_storage_path and nothing else. The PUBLIC card reads
 * companies.logo_url directly — it never resolves the branding row — so an
 * admin could upload a logo, see it in their own Settings preview, and the
 * live card a visitor actually sees would never change.
 */
const updateMock = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });

jest.mock("@/shared/lib/tenant", () => ({
  requireCompanyAccess: jest.fn().mockResolvedValue({ userId: "user-1" }),
}));

jest.mock("@/core/infrastructure/database/supabase/SupabaseSettingsRepository", () => ({
  SupabaseSettingsRepository: jest.fn().mockImplementation(() => ({
    upsertBranding: jest.fn().mockResolvedValue({ company_id: "company-1", logo_storage_path: "company-1/logo.png" }),
  })),
}));

jest.mock("@/core/infrastructure/storage/SupabaseStorageAdapter", () => ({
  SupabaseStorageAdapter: jest.fn().mockImplementation(() => ({
    ensureBucket: jest.fn().mockResolvedValue(undefined),
    upload: jest.fn().mockResolvedValue(undefined),
    getPublicUrl: jest.fn().mockReturnValue("https://cdn.test/company-logos/company-1/logo.png"),
  })),
}));

jest.mock("@/shared/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn().mockReturnValue({ update: updateMock }) },
}));

import { POST } from "@/app/api/admin/branding/logo/route";
import { NextRequest } from "next/server";

function makeRequest(): NextRequest {
  const file = new File([new Uint8Array([1, 2, 3])], "logo.png", { type: "image/png" });
  const formData = new FormData();
  formData.append("companyId", "company-1");
  formData.append("file", file);
  const req = new NextRequest("http://localhost/api/admin/branding/logo", { method: "POST" });
  req.formData = async () => formData;
  return req;
}

describe("logo upload writes companies.logo_url", () => {
  beforeEach(() => updateMock.mockClear());

  it("updates the company row the public card actually reads, not only the branding row", async () => {
    const response = await POST(makeRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.logoUrl).toBe("https://cdn.test/company-logos/company-1/logo.png");
    expect(updateMock).toHaveBeenCalledWith({ logo_url: "https://cdn.test/company-logos/company-1/logo.png" });
  });
});
