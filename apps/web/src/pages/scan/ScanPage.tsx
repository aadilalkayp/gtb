import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Camera, Lock, ArrowRight, RefreshCw } from "lucide-react";
import { claimScan, startScan, type ScanReport, type ScanTeaser } from "@/lib/api";
import { checkFraming } from "@/lib/framing";
import { Button, Field, Input, Select, ProgressRing, Spinner } from "@/components/ui";
import {
  FocusAreas,
  HighlightsAndSuggestions,
  ReadinessHero,
  RoadmapList,
  ScoreBars,
} from "@/components/ScanResults";

type Step = "capture" | "analyzing" | "teaser" | "report";

/**
 * The public Wedding Readiness Scan funnel — the product's only
 * unauthenticated surface. Capture → teaser score → contact details unlock the
 * full report (and create the lead server-side). Everything renders from the
 * scan itself; no client-record data ever reaches this page.
 */
export function ScanPage() {
  const [step, setStep] = useState<Step>("capture");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [weddingDate, setWeddingDate] = useState("");
  const [type, setType] = useState<"groom" | "bride">("groom");
  const [scanId, setScanId] = useState<string | null>(null);
  const [teaser, setTeaser] = useState<ScanTeaser | null>(null);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [contact, setContact] = useState({ name: "", email: "", phone: "", city: "" });
  const fileInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const pickFile = async (f: File | null) => {
    setFile(f);
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
    if (f) {
      const framingError = await checkFraming(f);
      if (framingError) {
        setError(framingError);
        setFile(null); // keep the preview so they see what to fix
      }
    }
  };

  const runScan = async () => {
    if (!file || !weddingDate) {
      setError("Add a selfie and your wedding date to start.");
      return;
    }
    setError(null);
    setStep("analyzing");
    try {
      const res = await startScan({ file, weddingDate, type });
      if (res.report) {
        // A logged-in client on the public funnel: the server treated this as a
        // portal rescan and already attached the scan to their record, so the
        // portal is where the result lives.
        navigate("/portal/scan", { replace: true });
        return;
      }
      if (res.scanId && res.teaser) {
        setScanId(res.scanId);
        setTeaser(res.teaser);
        setStep("teaser");
      } else {
        throw new Error("Unexpected response");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed. Please try again.");
      setStep("capture");
    }
  };

  const submitClaim = async () => {
    if (!scanId) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await claimScan({ scanId, ...contact });
      setReport(res.report);
      setStep("report");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not unlock your report.");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 font-display text-xs font-semibold text-primary-foreground shadow-button">
              G
            </div>
            <span className="text-sm font-semibold">GTB · Wedding Readiness Scan</span>
          </div>
          <Link to="/portal/login" className="text-xs font-medium text-primary hover:underline">
            Client login
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-8 pb-16">
        {step === "capture" && (
          <div className="animate-fade-up space-y-6">
            <div>
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                How wedding-ready are you?
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Upload a selfie and your wedding date — our AI scores your skin, hair, beard and
                style, then builds your week-by-week prep roadmap. Free, in under a minute.
              </p>
            </div>

            <button
              onClick={() => fileInput.current?.click()}
              className="relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-card border-2 border-dashed border-border bg-surface transition-colors duration-150 hover:border-primary/50 active:scale-[0.99]"
            >
              {preview ? (
                <img src={preview} alt="Your selfie" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <>
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Camera className="h-6 w-6" />
                  </span>
                  <span className="text-sm font-medium">Take or upload a selfie</span>
                  <span className="px-8 text-xs text-muted-foreground">
                    Face the camera straight on, in even daylight, no filters — the clearer the
                    photo, the truer the score.
                  </span>
                </>
              )}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="user"
              className="hidden"
              onChange={(e) => void pickFile(e.target.files?.[0] ?? null)}
            />
            {preview && (
              <button
                onClick={() => fileInput.current?.click()}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <RefreshCw className="h-3 w-3" /> Use a different photo
              </button>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Your wedding date" htmlFor="scan-date" required>
                <Input
                  id="scan-date"
                  type="date"
                  value={weddingDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setWeddingDate(e.target.value)}
                />
              </Field>
              <Field label="I'm the" htmlFor="scan-type">
                <Select
                  id="scan-type"
                  value={type}
                  onChange={(e) => setType(e.target.value === "bride" ? "bride" : "groom")}
                >
                  <option value="groom">Groom</option>
                  <option value="bride">Bride</option>
                </Select>
              </Field>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <Button onClick={() => void runScan()} disabled={!file || !weddingDate} className="w-full">
              Scan my readiness <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              Your photo is analyzed for appearance only — never a medical assessment — and is
              deleted within 24 hours unless you save your report.
            </p>
          </div>
        )}

        {step === "analyzing" && (
          <div className="flex animate-fade-up flex-col items-center gap-4 py-24 text-center">
            <Spinner className="h-8 w-8" />
            <p className="font-display text-lg font-medium">Reading your readiness…</p>
            <p className="text-sm text-muted-foreground">Scoring skin, hair, beard and style.</p>
          </div>
        )}

        {step === "teaser" && teaser && (
          <div className="animate-fade-up space-y-6">
            <div className="card flex flex-col items-center gap-4 p-8 text-center">
              <ProgressRing value={(teaser.readinessScore ?? 0) / 100} size={132} strokeWidth={10} className="text-primary">
                <div className="leading-tight">
                  <span className="font-num text-4xl font-bold">{teaser.readinessScore}</span>
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    ready
                  </span>
                </div>
              </ProgressRing>
              <div>
                <p className="font-display text-xl font-semibold">
                  Wedding in {teaser.daysToWedding} days
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your full breakdown — skin, hair, beard, style — plus a week-by-week roadmap is
                  ready.
                </p>
              </div>
              <div className="flex w-full items-center gap-2 rounded-lg bg-muted px-4 py-2.5 text-xs text-muted-foreground">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                Enter your details below to unlock the full report. It's free.
              </div>
            </div>

            <div className="card space-y-4 p-5">
              <Field label="Name" htmlFor="c-name" required>
                <Input
                  id="c-name"
                  value={contact.name}
                  onChange={(e) => setContact({ ...contact, name: e.target.value })}
                  autoComplete="name"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email" htmlFor="c-email" required>
                  <Input
                    id="c-email"
                    type="email"
                    value={contact.email}
                    onChange={(e) => setContact({ ...contact, email: e.target.value })}
                    autoComplete="email"
                  />
                </Field>
                <Field label="Phone" htmlFor="c-phone" required>
                  <Input
                    id="c-phone"
                    type="tel"
                    value={contact.phone}
                    onChange={(e) => setContact({ ...contact, phone: e.target.value })}
                    autoComplete="tel"
                  />
                </Field>
              </div>
              <Field label="City" htmlFor="c-city">
                <Input
                  id="c-city"
                  value={contact.city}
                  onChange={(e) => setContact({ ...contact, city: e.target.value })}
                  autoComplete="address-level2"
                />
              </Field>
              {error && <p className="text-sm text-danger">{error}</p>}
              <Button
                onClick={() => void submitClaim()}
                disabled={claiming || !contact.name || !contact.email || !contact.phone}
                className="w-full"
              >
                {claiming ? "Unlocking…" : "Unlock my full report"}
              </Button>
            </div>
          </div>
        )}

        {step === "report" && report && report.scores && (
          <div className="animate-fade-up space-y-5">
            <div className="card p-6">
              <ReadinessHero
                readiness={report.scores.readiness}
                daysToWedding={report.daysToWedding}
                weddingDate={report.weddingDate}
              />
              <ScoreBars scores={report.scores} className="mt-6" />
            </div>

            <div className="card space-y-5 p-6">
              <FocusAreas areas={report.focusAreas} />
              <HighlightsAndSuggestions
                highlights={report.highlights}
                suggestions={report.suggestions}
              />
            </div>

            {report.roadmap.length > 0 && (
              <div className="card p-6">
                <h2 className="font-display text-lg font-semibold">Your prep roadmap</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Week-by-week focus built from your scan, plus the milestones every wedding needs.
                </p>
                <div className="mt-4">
                  <RoadmapList items={report.roadmap} />
                </div>
              </div>
            )}

            <div className="card bg-gradient-to-br from-primary via-primary to-primary/80 p-6 text-primary-foreground">
              <h2 className="font-display text-xl font-semibold">Want the score to move?</h2>
              <p className="mt-1.5 text-sm leading-relaxed opacity-90">
                The scan shows where you stand — the GTB program is how the number climbs. Our team
                has your report and will reach out, or ask us anything right away.
              </p>
              <p className="mt-4 text-xs opacity-80">
                Rescan monthly to watch your progress — your report is saved to your email.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
