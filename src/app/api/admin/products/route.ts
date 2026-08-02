import { NextRequest } from "next/server";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseProductRepository } from "@/core/infrastructure/database/supabase/SupabaseProductRepository";
import { CreateProductSchema } from "@/core/domain/models/types";
import { ProductFilter } from "@/core/domain/repositories/IProductRepository";

// Reads the session cookie and/or query params, so it can never be rendered
// statically.
export const dynamic = "force-dynamic";

const productRepo = new SupabaseProductRepository();

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const companyId = params.get("companyId");
    if (!companyId) return formatApiResponse(null, 400, "companyId query parameter is required");

    await requireCompanyAccess(req, companyId, "read:products");

    const status = params.get("status");
    const featured = params.get("featured");

    const filter: ProductFilter = {
      company_id: companyId,
      search: params.get("search") ?? undefined,
      category: params.get("category") ?? undefined,
      status: status === "active" || status === "inactive" ? status : undefined,
      featured: featured === "true" ? true : featured === "false" ? false : undefined,
      sortBy: (params.get("sortBy") as ProductFilter["sortBy"]) ?? undefined,
      sortDir: params.get("sortDir") === "asc" ? "asc" : "desc",
      limit: Math.min(Number(params.get("limit")) || 20, 100),
      offset: Number(params.get("offset")) || 0,
    };

    const result = await productRepo.listProducts(filter);
    return formatApiResponse(result, 200, "Products retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateProductSchema.parse(body);

    await requireCompanyAccess(req, parsed.company_id, "write:products");

    const product = await productRepo.createProduct(parsed);
    return formatApiResponse(product, 201, "Product created successfully");
  } catch (error) {
    return handleApiError(error);
  }
}
