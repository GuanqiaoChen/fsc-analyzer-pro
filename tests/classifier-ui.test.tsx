import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { Route } from "../src/routes/index";
import {
  analyzeCompany,
  classifyCompany,
  checkHealth,
  ApiError,
  type AnalysisResult,
} from "../src/lib/classifier-api";

vi.mock("../src/lib/classifier-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/classifier-api")>()),
  analyzeCompany: vi.fn(),
  classifyCompany: vi.fn(),
  checkHealth: vi.fn(),
}));

const result: AnalysisResult = {
  profile: {
    companyName: "Unseen Works",
    summary: "Makes wire rope",
    products: ["wire rope"],
    services: [],
    capabilities: [],
    materials: [],
    industries: [],
    keywords: [],
  },
  recommendations: [
    {
      code: "4010",
      description: "Chain and Wire Rope",
      score: 0.92,
      rationale: "Manufactures rope",
      evidence: ["wire rope"],
    },
  ],
  sources: [{ sourceType: "manual", sourceName: "Company text", text: "Makes wire rope" }],
  warnings: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkHealth).mockResolvedValue({ status: "ok" });
  vi.mocked(analyzeCompany).mockResolvedValue(structuredClone(result));
  vi.mocked(classifyCompany).mockResolvedValue({ recommendations: [] });
  const Page = Route.options.component as ComponentType;
  render(<Page />);
});
afterEach(cleanup);

async function analyze() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/Company Name/), "Unseen Works");
  await user.type(screen.getByLabelText("Additional Company Information"), "Makes wire rope");
  await user.click(screen.getByRole("button", { name: "Analyze Company" }));
  return user;
}

it("blocks empty input before any analysis request", async () => {
  await userEvent.click(screen.getByRole("button", { name: "Analyze Company" }));
  expect(screen.getByText("Enter a company name to begin analysis.")).toBeTruthy();
  expect(analyzeCompany).not.toHaveBeenCalled();
});

it("displays API scores as percentages and sends edits to classify without extraction", async () => {
  const user = await analyze();
  expect(await screen.findByText("match score 92%")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Edit Profile" }));
  await user.clear(screen.getByLabelText("Summary"));
  await user.type(screen.getByLabelText("Summary"), "Edited company profile");
  await user.click(screen.getByRole("button", { name: "Re-classify" }));
  await waitFor(() =>
    expect(classifyCompany).toHaveBeenCalledWith(
      expect.objectContaining({ summary: "Edited company profile" }),
    ),
  );
  expect(analyzeCompany).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("No strong FSC match")).toBeTruthy();
});

it("retains sources and offers retry after an LLM failure", async () => {
  vi.mocked(analyzeCompany).mockRejectedValueOnce(
    new ApiError("OpenAI unavailable", {
      sources: result.sources,
      warnings: ["Partial website content"],
    }),
  );
  const user = await analyze();
  expect(await screen.findByText("OpenAI unavailable")).toBeTruthy();
  expect(screen.getByText("Company text")).toBeTruthy();
  expect(screen.getByText("Partial website content")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Try Again" }));
  expect(await screen.findByText("4010")).toBeTruthy();
});

it("retries classification while preserving the edited profile on failure", async () => {
  vi.mocked(classifyCompany).mockRejectedValueOnce(new ApiError("Please retry classification"));
  const user = await analyze();
  await screen.findByText("4010");
  await user.click(screen.getByRole("button", { name: "Re-classify" }));
  expect(await screen.findByText("Please retry classification")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Edit Profile" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Try Again" }));
  await waitFor(() => expect(classifyCompany).toHaveBeenCalledTimes(2));
  expect(analyzeCompany).toHaveBeenCalledTimes(1);
});
