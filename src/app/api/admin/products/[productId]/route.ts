import { NextRequest } from "next/server";
import { z } from "zod";
import { formatApiResponse } from "@/shared/lib/security";
import { handleApiError } from "@/shared/lib/apiHandler";
import { requireCompanyAccess } from "@/shared/lib/tenant";
import { SupabaseProductRepository } from "@/core/infrastructure/database/supabase/SupabaseProductRepository";
import { UpdateProductSchema } from "@/core/domain/models/types";

// Reads the session cookie and/or query params, so it can never be rendered
// statically.
export const dynamic = "force-dynamic";

const productRepo = new SupabaseProductRepository();

/** Tenancy check shared by all three verbs: the product must exist AND belong
 * to the company the caller is authorized for — a valid session for company A
 * must never read or mutate company B's product by guessing its id. */
async function loadOwnedProduct(req: NextRequest, productId: string, companyId: string | null, permission: "read:products" | "write:products" | "delete:products") {
  if (!companyId) return { error: formatApiResponse(null, 400, "companyId is required") };
  await requireCompanyAccess(req, companyId, permission);
  const product = await productRepo.getProductById(productId);
  if (!product || product.company_id !== companyId) return { error: formatApiResponse(null, 404, "Product not found") };
  return { product };
}

export async function GET(req: NextRequest, { params }: { params: { productId: string } }) {
  try {
    const result = await loadOwnedProduct(req, params.productId, req.nextUrl.searchParams.get("companyId"), "read:products");
    if ("error" in result) return result.error;
    return formatApiResponse(result.product, 200, "Product retrieved successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

const UpdateBodySchema = z.object({ company_id: z.string().uuid() }).and(UpdateProductSchema);

export async function PUT(req: NextRequest, { params }: { params: { productId: string } }) {
  try {
    const body = await req.json();
    const parsed = UpdateBodySchema.parse(body);
    const { company_id, ...fields } = parsed;

    const result = await loadOwnedProduct(req, params.productId, company_id, "write:products");
    if ("error" in result) return result.error;

    const product = await productRepo.updateProduct(params.productId, fields);
    return formatApiResponse(product, 200, "Product updated successfully");
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { productId: string } }) {
  try {
    const result = await loadOwnedProduct(req, params.productId, req.nextUrl.searchParams.get("companyId"), "delete:products");
    if ("error" in result) return result.error;

    await productRepo.softDeleteProduct(params.productId);
    return formatApiResponse(null, 200, "Product deleted");
  } catch (error) {
    return handleApiError(error);
  }
}
