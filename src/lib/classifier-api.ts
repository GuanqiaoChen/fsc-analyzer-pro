/** Browser/server contract mirrors backend/app/schemas.py. Secrets stay in Python. */
export type ProfileField =
  "products" | "services" | "capabilities" | "materials" | "industries" | "keywords";
export type CompanyProfile = { companyName: string; summary: string } & Record<
  ProfileField,
  string[]
>;
export type SourceEvidence = {
  sourceType: "website" | "document" | "manual";
  sourceName: string;
  text: string;
};
export type FscRecommendation = {
  code: string;
  description: string;
  score: number;
  rationale: string;
  evidence: string[];
};
export type AnalysisResult = {
  profile: CompanyProfile;
  recommendations: FscRecommendation[];
  sources: SourceEvidence[];
  warnings: string[];
};
export type CompanyInput = {
  companyName: string;
  websiteUrl: string;
  emailDomain: string;
  additionalText: string;
};
export type ErrorDetail = {
  message?: string;
  sources?: SourceEvidence[];
  warnings?: string[];
  profile?: CompanyProfile | null;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public detail: ErrorDetail = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const baseUrl = (import.meta.env["VITE_API_BASE_URL"] ?? "").replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(240_000),
    });
    const body = await response.json();
    if (!response.ok) {
      const detail = body.detail;
      if (Array.isArray(detail)) {
        throw new ApiError(
          detail
            .map(
              (item: { loc?: string[]; msg?: string }) =>
                `${item.loc?.slice(1).join(".")}: ${item.msg}`,
            )
            .join("; "),
        );
      }
      throw new ApiError(
        typeof detail === "string" ? detail : (detail?.message ?? "Analysis failed. Please retry."),
        typeof detail === "object" && detail ? detail : {},
      );
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      error instanceof DOMException && error.name === "TimeoutError"
        ? "The analysis timed out. Please retry with fewer sources."
        : "Could not reach the backend. Check that the Python server is running and retry.",
    );
  }
}

export function analyzeCompany(input: CompanyInput, file: File | null): Promise<AnalysisResult> {
  const data = new FormData();
  for (const [key, value] of Object.entries(input)) data.append(key, value.trim());
  if (file) data.append("files", file);
  // The browser adds the multipart boundary; do not manually set Content-Type.
  return request("/api/analyze", { method: "POST", body: data });
}

export function classifyCompany(
  profile: CompanyProfile,
): Promise<{ recommendations: FscRecommendation[] }> {
  return request("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
}

export function checkHealth(): Promise<{ status: string }> {
  return request("/health");
}
