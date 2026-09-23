import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeCompany, ApiError, classifyCompany } from "../src/lib/classifier-api";

afterEach(() => vi.unstubAllGlobals());

describe("real API contract", () => {
  it("sends the company fields and PDF with a browser-generated multipart boundary", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sources: [] }) });
    vi.stubGlobal("fetch", fetch);
    const file = new File(["pdf"], "capability.pdf", { type: "application/pdf" });
    await analyzeCompany(
      {
        companyName: " Example ",
        websiteUrl: "https://example.com",
        emailDomain: "",
        additionalText: "wire rope",
      },
      file,
    );
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe("/api/analyze");
    expect(options.headers).toBeUndefined();
    expect(options.body.get("companyName")).toBe("Example");
    expect(options.body.get("files")).toBe(file);
  });

  it("preserves source evidence on a controlled backend failure", async () => {
    const detail = {
      message: "OpenAI unavailable",
      sources: [{ sourceType: "manual", sourceName: "Input", text: "wire rope" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ detail }) }),
    );
    await expect(
      analyzeCompany(
        { companyName: "Example", websiteUrl: "", emailDomain: "", additionalText: "wire rope" },
        null,
      ),
    ).rejects.toMatchObject({ message: detail.message, detail });
  });

  it("reports network failures without leaking internals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("internal network error")));
    await expect(
      analyzeCompany(
        { companyName: "Example", websiteUrl: "", emailDomain: "", additionalText: "" },
        null,
      ),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("posts edited profile JSON directly to classify", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ recommendations: [] }) });
    vi.stubGlobal("fetch", fetch);
    const profile = {
      companyName: "Example",
      summary: "Edited",
      products: ["chain"],
      services: [],
      capabilities: [],
      materials: [],
      industries: [],
      keywords: [],
    };
    await classifyCompany(profile);
    expect(fetch.mock.calls[0]![0]).toBe("/api/classify");
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual(profile);
  });
});
