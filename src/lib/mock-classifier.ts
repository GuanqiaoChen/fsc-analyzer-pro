export type ProfileField = "products" | "services" | "capabilities" | "materials" | "industries" | "keywords";

export type CompanyProfile = {
  summary: string;
  products: string[];
  services: string[];
  capabilities: string[];
  materials: string[];
  industries: string[];
  keywords: string[];
};

export type FscRecommendation = {
  code: string;
  description: string;
  score: number;
  rationale: string;
  evidence: string[];
};

export type MockScenario = "success" | "website-warning" | "document-warning" | "failure" | "no-match";

export type AnalysisResult = {
  profile: CompanyProfile;
  recommendations: FscRecommendation[];
  warning?: string;
  noStrongMatch?: boolean;
};

const profile: CompanyProfile = {
  summary: "Precision manufacturer supplying machined aluminum and titanium components, structural assemblies, and finishing services to aerospace and defense programs.",
  products: ["Machined fittings", "Titanium fasteners", "Structural assemblies"],
  services: ["CNC machining", "Surface finishing", "Quality inspection"],
  capabilities: ["5-axis milling", "AS9100D", "NADCAP processing"],
  materials: ["6061-T6 aluminum", "Ti-6Al-4V", "Inconel"],
  industries: ["Aerospace", "Defense", "MRO"],
  keywords: ["precision", "flight hardware", "close tolerance"],
};

const recommendations: FscRecommendation[] = [
  {
    code: "1560",
    description: "Airframe Structural Components",
    score: 94,
    rationale: "Structural assemblies and load-bearing machined parts align directly with airframe component supply.",
    evidence: ["“structural assemblies”", "“flight hardware”", "Document p. 2"],
  },
  {
    code: "1680",
    description: "Miscellaneous Aircraft Accessories and Components",
    score: 88,
    rationale: "Specialized fittings and precision components support broader aircraft accessory applications.",
    evidence: ["“machined fittings”", "“aerospace programs”"],
  },
  {
    code: "5340",
    description: "Hardware, Commercial",
    score: 76,
    rationale: "Fasteners and general-purpose metal hardware create a credible secondary classification.",
    evidence: ["“titanium fasteners”", "“close tolerance”"],
  },
  {
    code: "3426",
    description: "Metal Finishing Equipment",
    score: 64,
    rationale: "In-house surface finishing and NADCAP processing indicate related finishing capability.",
    evidence: ["“surface finishing”", "“NADCAP processing”"],
  },
];

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function mockAnalyzeCompany(scenario: MockScenario, onStage: (stage: number) => void): Promise<AnalysisResult> {
  for (let stage = 1; stage <= 3; stage += 1) {
    onStage(stage);
    await wait(650);
  }

  if (scenario === "failure") throw new Error("The mock analysis could not be completed. Please try again.");

  const base = { profile: structuredClone(profile), recommendations: structuredClone(recommendations) };
  if (scenario === "website-warning") return { ...base, warning: "Website extraction was incomplete. Results use the information and documents available." };
  if (scenario === "document-warning") return { ...base, warning: "One document could not be fully extracted. Review the highlighted profile details before re-classifying." };
  if (scenario === "no-match") return { ...base, recommendations: base.recommendations.map((item, index) => ({ ...item, score: 39 - index * 5 })), noStrongMatch: true };
  return base;
}
