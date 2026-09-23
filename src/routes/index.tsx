import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "../components/ui/button";
import { mockAnalyzeCompany, type AnalysisResult, type MockScenario, type ProfileField } from "../lib/mock-classifier";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FSC Code Classifier | Internal Sales Tool" },
      { name: "description", content: "Analyze company capabilities and review ranked Federal Supply Class recommendations." },
      { property: "og:title", content: "FSC Code Classifier" },
      { property: "og:description", content: "Internal company capability and FSC recommendation workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Status = "idle" | "loading" | "success" | "error";
type FormState = { companyName: string; website: string; emailDomain: string; additionalInfo: string };

const initialForm: FormState = {
  companyName: "",
  website: "",
  emailDomain: "",
  additionalInfo: "",
};

const profileLabels: Record<ProfileField, string> = {
  products: "Products",
  services: "Services",
  capabilities: "Capabilities",
  materials: "Materials",
  industries: "Industries",
  keywords: "Keywords",
};

const scenarioLabels: Record<MockScenario, string> = {
  success: "Successful result",
  "website-warning": "Website warning",
  "document-warning": "Document warning",
  failure: "Analysis failure",
  "no-match": "No strong match",
};

function Index() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [stage, setStage] = useState(0);
  const [scenario, setScenario] = useState<MockScenario>("success");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [newTags, setNewTags] = useState<Partial<Record<ProfileField, string>>>({});
  const [dragActive, setDragActive] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const updateForm = (key: keyof FormState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    if (key === "companyName") setNameError("");
  };

  const acceptFile = (selected?: File) => {
    if (!selected) return;
    setFile(selected);
  };

  const analyze = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!form.companyName.trim()) {
      setNameError("Enter a company name to begin analysis.");
      return;
    }
    setNameError("");
    setError("");
    setStatus("loading");
    setResult(null);
    setStage(0);
    try {
      const response = await mockAnalyzeCompany(scenario, setStage);
      setResult(response);
      setStatus("success");
      setIsEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed. Please try again.");
      setStatus("error");
    }
  };

  const removeTag = (field: ProfileField, value: string) => {
    if (!result || !isEditing) return;
    setResult({ ...result, profile: { ...result.profile, [field]: result.profile[field].filter((tag) => tag !== value) } });
  };

  const addTag = (field: ProfileField) => {
    const value = newTags[field]?.trim();
    if (!result || !value || result.profile[field].includes(value)) return;
    setResult({ ...result, profile: { ...result.profile, [field]: [...result.profile[field], value] } });
    setNewTags((current) => ({ ...current, [field]: "" }));
  };

  const handleTagKey = (event: KeyboardEvent<HTMLInputElement>, field: ProfileField) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addTag(field);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    acceptFile(event.dataTransfer.files[0]);
  };

  const stages = ["Collecting company information", "Extracting capabilities", "Matching FSC codes"];

  return (
    <div className="min-h-screen bg-background text-[13px] leading-normal text-foreground antialiased">
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur-sm">
        <div className="flex h-11 items-center gap-3 px-4">
          <div className="flex items-center gap-2">
            <div className="grid size-6 place-items-center rounded-sm bg-primary font-mono text-[11px] font-medium text-primary-foreground">F</div>
            <div className="font-mono text-[12px] uppercase tracking-widest">FSC Code Classifier</div>
          </div>
          <div className="ml-3 hidden rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground sm:block">v0.9 · Internal</div>
          <div className="ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            <span>Mock mode</span>
            <span className="text-success">● Ready</span>
          </div>
        </div>
      </header>

      <div className="flex items-center gap-2 border-b bg-background px-4 py-2 font-mono text-[11px] text-muted-foreground">
        <span>Company Information</span><span>/</span><span className="text-primary">Analyze Company</span><span>/</span><span>Profile &amp; Recommendations</span>
        <span className="ml-auto hidden uppercase tracking-wide md:block">Frontend prototype</span>
      </div>

      <main className="mx-auto grid max-w-[1440px] grid-cols-12 gap-3 p-3">
        <section className="col-span-12 self-start rounded border bg-card xl:col-span-4">
          <SectionHeader title="(a) Company Information" meta="POST /api/analyze" />
          <form className="space-y-3 p-3" onSubmit={analyze} noValidate>
            <Field label="Company Name" required error={nameError}>
              <input value={form.companyName} onChange={updateForm("companyName")} aria-invalid={Boolean(nameError)} placeholder="e.g. Northstar Precision Systems" className="w-full rounded-sm border bg-background px-2 py-1.5 text-[13px] outline-none focus:border-primary focus:ring-1 focus:ring-ring" />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Website URL"><input value={form.website} onChange={updateForm("website")} placeholder="https://company.com" className="w-full rounded-sm border bg-background px-2 py-1.5 font-mono text-[12px] outline-none focus:border-primary focus:ring-1 focus:ring-ring" /></Field>
              <Field label="Email Domain"><input value={form.emailDomain} onChange={updateForm("emailDomain")} placeholder="company.com" className="w-full rounded-sm border bg-background px-2 py-1.5 font-mono text-[12px] outline-none focus:border-primary focus:ring-1 focus:ring-ring" /></Field>
            </div>
            <Field label="Additional Company Information">
              <textarea value={form.additionalInfo} onChange={updateForm("additionalInfo")} rows={4} placeholder="Certifications, capabilities, materials, contract history…" className="min-h-20 w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary focus:ring-1 focus:ring-ring" />
            </Field>
            <div
              onDragEnter={() => setDragActive(true)}
              onDragLeave={() => setDragActive(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={onDrop}
              className={`rounded-sm border border-dashed px-3 py-5 text-center transition-colors ${dragActive ? "border-primary bg-muted" : "bg-background"}`}
            >
              <input ref={fileInput} type="file" accept=".pdf,.doc,.docx,.txt" className="sr-only" onChange={(event) => acceptFile(event.target.files?.[0])} />
              <div className="font-mono text-[11px] text-muted-foreground">Drop PDF / capability statement</div>
              <button type="button" className="mt-1 font-mono text-[10px] text-primary underline underline-offset-2" onClick={() => fileInput.current?.click()}>or browse documents</button>
              {file && <div className="mx-auto mt-2 flex max-w-full items-center justify-between gap-2 rounded-sm border bg-card px-2 py-1 font-mono text-[10px] text-primary"><span className="truncate">{file.name}</span><button type="button" aria-label="Remove document" onClick={() => setFile(null)}>×</button></div>}
            </div>
            <div className="flex items-end gap-2">
              <Field label="Preview State" className="flex-1">
                <select value={scenario} onChange={(event) => setScenario(event.target.value as MockScenario)} className="w-full rounded-sm border bg-background px-2 py-1.5 font-mono text-[11px] outline-none focus:border-primary focus:ring-1 focus:ring-ring">
                  {Object.entries(scenarioLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Button type="submit" disabled={status === "loading"} className="min-w-40">{status === "loading" ? "Analyzing…" : "Analyze Company"}</Button>
            </div>
          </form>

          {status === "loading" && (
            <div className="border-t px-3 py-3" role="status" aria-live="polite">
              <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${stage * 33.33}%` }} /></div>
              <div className="mt-2 space-y-1 font-mono text-[10px]">
                {stages.map((label, index) => <div key={label} className={index + 1 < stage ? "text-success" : index + 1 === stage ? "progress-active text-primary" : "text-muted-foreground"}>{index + 1 < stage ? "✓" : index + 1 === stage ? "◐" : "○"} {label}</div>)}
              </div>
            </div>
          )}
          {status === "error" && <Notice tone="error" title="Analysis failure" detail={error} action={<Button variant="secondary" onClick={() => analyze()}>Try Again</Button>} />}
        </section>

        <section className="col-span-12 self-start rounded border bg-card xl:col-span-4">
          <SectionHeader title="(b) Extracted Company Profile" meta={result ? "Profile ready" : "Awaiting analysis"} />
          {!result ? <EmptyPanel text="Run an analysis to extract the company summary, products, services, capabilities, materials, industries, and keywords." /> : (
            <div className="result-enter space-y-3 p-3">
              <div className="flex justify-end gap-1">
                <Button variant="secondary" onClick={() => setIsEditing((value) => !value)}>{isEditing ? "Done Editing" : "Edit Profile"}</Button>
                <Button onClick={() => analyze()}>Re-classify</Button>
              </div>
              <Field label="Summary">
                {isEditing ? <textarea value={result.profile.summary} onChange={(event) => setResult({ ...result, profile: { ...result.profile, summary: event.target.value } })} rows={4} className="w-full resize-y rounded-sm border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary focus:ring-1 focus:ring-ring" /> : <div className="rounded-sm border bg-background p-2 text-[12px] text-muted-foreground">{result.profile.summary}</div>}
              </Field>
              {(Object.keys(profileLabels) as ProfileField[]).map((field) => (
                <div key={field}>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{profileLabels[field]}</div>
                  <div className="flex flex-wrap gap-1">
                    {result.profile[field].map((tag) => <span key={tag} className="inline-flex min-h-6 items-center gap-1 rounded-sm border bg-background px-1.5 font-mono text-[11px]">{tag}{isEditing && <button type="button" aria-label={`Remove ${tag}`} className="text-muted-foreground hover:text-destructive" onClick={() => removeTag(field, tag)}>×</button>}</span>)}
                    {isEditing && <input value={newTags[field] ?? ""} onChange={(event) => setNewTags((current) => ({ ...current, [field]: event.target.value }))} onKeyDown={(event) => handleTagKey(event, field)} onBlur={() => addTag(field)} placeholder="+ add" className="h-6 w-24 rounded-sm border border-dashed bg-card px-1.5 font-mono text-[11px] outline-none focus:border-primary" />}
                  </div>
                </div>
              ))}
              {result.warning && <Notice tone="warning" title={scenario === "document-warning" ? "Document extraction warning" : "Website extraction warning"} detail={result.warning} compact />}
            </div>
          )}
        </section>

        <section className="col-span-12 self-start rounded border bg-card xl:col-span-4">
          <SectionHeader title="(c) Recommended FSC Codes" meta={result ? `Ranked · ${result.recommendations.length}` : "Awaiting analysis"} />
          {!result ? <EmptyPanel text="Ranked FSC recommendations and supporting evidence will appear here after analysis." /> : (
            <div className="result-enter space-y-2 p-2.5">
              {result.noStrongMatch && <Notice tone="warning" title="No strong FSC match" detail="No recommendation exceeded the confidence threshold. Review the extracted profile and add more specific capability information." compact />}
              {result.recommendations.map((item, index) => (
                <article key={item.code} className={`rounded border bg-background p-2.5 ${index === 0 && !result.noStrongMatch ? "ring-1 ring-success/30" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className={`font-mono text-[24px] font-medium leading-none ${item.score >= 80 ? "text-success" : item.score < 50 ? "text-warning" : "text-primary"}`}>{item.code}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold">{item.description}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">match score {item.score}%</div>
                    </div>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted"><div className={item.score >= 80 ? "h-full bg-success" : item.score < 50 ? "h-full bg-warning" : "h-full bg-primary"} style={{ width: `${item.score}%` }} /></div>
                  <p className="mt-2 text-[11px] text-muted-foreground">{item.rationale}</p>
                  <div className="mt-2 flex flex-wrap gap-1">{item.evidence.map((evidence) => <span key={evidence} className="rounded-sm border bg-card px-1 py-0.5 font-mono text-[10px] text-muted-foreground">{evidence}</span>)}</div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 border-t px-4 py-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{result ? form.companyName : "No company analyzed"}</span><span>/</span><span>{result ? `${result.recommendations.length} recommendations` : "0 recommendations"}</span><span className="ml-auto">Mocked frontend · POST /api/classify · GET /health</span>
      </footer>
    </div>
  );
}

function SectionHeader({ title, meta }: { title: string; meta: string }) {
  return <div className="flex min-h-9 items-center gap-2 border-b px-3"><h2 className="font-mono text-[11px] uppercase tracking-widest text-primary">{title}</h2><span className="ml-auto font-mono text-[10px] text-muted-foreground">{meta}</span></div>;
}

function Field({ label, required, error, className = "", children }: { label: string; required?: boolean; error?: string; className?: string; children: React.ReactNode }) {
  return <label className={`block ${className}`}><span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}{required && <span className="text-destructive"> *</span>}</span>{children}{error && <span className="mt-1 block text-[11px] text-destructive" role="alert">{error}</span>}</label>;
}

function EmptyPanel({ text }: { text: string }) {
  return <div className="p-3"><div className="rounded-sm border border-dashed bg-background px-4 py-12 text-center font-mono text-[11px] leading-relaxed text-muted-foreground">{text}</div></div>;
}

function Notice({ tone, title, detail, action, compact = false }: { tone: "warning" | "error"; title: string; detail: string; action?: React.ReactNode; compact?: boolean }) {
  return <div className={`${compact ? "rounded-sm px-2 py-1.5" : "m-3 rounded p-3"} border ${tone === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-warning/30 bg-warning-soft text-warning"}`} role="alert"><div className="flex items-center gap-2"><span className="font-mono text-[11px]">!</span><strong className="text-[11px]">{title}</strong>{action && <div className="ml-auto">{action}</div>}</div><p className="mt-1 text-[11px] leading-relaxed">{detail}</p></div>;
}
