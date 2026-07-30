export interface ApiEnvelope<T> {
  status: number;
  success: boolean;
  message: string;
  data: T;
  errors: string[];
  timestamp: string;
}

export class ApiClientError extends Error {
  constructor(public status: number, message: string, public errors: string[] = []) {
    super(message);
    this.name = "ApiClientError";
  }
}

/** Thin fetch wrapper so every dashboard page handles the API's
 * { status, success, message, data, errors } envelope and non-2xx
 * responses the same way, instead of each page re-implementing it. */
export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });

  let json: ApiEnvelope<T>;
  try {
    json = await res.json();
  } catch {
    throw new ApiClientError(res.status, "Server returned an invalid response");
  }

  if (!res.ok || !json.success) {
    throw new ApiClientError(res.status, json.message || "Request failed", json.errors || []);
  }

  return json.data;
}
