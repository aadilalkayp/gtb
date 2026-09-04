import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PRODUCT_NAME } from "@/components/ScanReportView";

/**
 * Public legal pages. Required before running ads (Meta asks for a privacy
 * policy URL) and to make the scan's data promises (24h deletion of unclaimed
 * photos, appearance-only analysis, AI processing) public and checkable.
 *
 * TODO(launch): replace the [bracketed] placeholders with GTB's registered
 * legal name, address, and contact email before this goes live.
 */

const LEGAL_ENTITY = "[GTB legal entity name]";
const LEGAL_ADDRESS = "[Registered address, City, State, India]";
const CONTACT_EMAIL = "[privacy@glowtobe.com]";
const EFFECTIVE = "4 September 2026";

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link to="/scan" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 font-display text-xs font-semibold text-primary-foreground shadow-button">
              G
            </div>
            <span className="text-sm font-semibold">GTB · Groom To Be · Glow To Be</span>
          </Link>
          <nav className="flex gap-4 text-xs font-medium text-primary">
            <Link to="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link to="/terms" className="hover:underline">
              Terms
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-10 pb-20">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">Effective {EFFECTIVE}</p>
        <div className="legal mt-8 space-y-6 text-[15px] leading-relaxed text-foreground/90 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_li]:text-muted-foreground [&_p]:text-muted-foreground [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
          {children}
        </div>
      </main>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        This policy explains how {LEGAL_ENTITY} ("GTB", "we") handles personal information across
        the Groom To Be and Glow To Be services: the {PRODUCT_NAME}, the client portal, and our
        coaching programmes. It applies to <strong>app.glowtobe.com</strong> and related services.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Scan photos.</strong> Selfies you upload to the {PRODUCT_NAME} (and, if you use
          those features, outfit and full-body photos). Photos are used only to produce your report.
        </li>
        <li>
          <strong>Contact details.</strong> Name, email, phone and city when you unlock a report or
          are enrolled as a client.
        </li>
        <li>
          <strong>Wedding and preferences.</strong> Your wedding date, roadmap progress, and — for
          clients — the onboarding assessment you fill in (skin, fitness and style preferences).
        </li>
        <li>
          <strong>Usage data.</strong> Standard server logs (IP address, browser, timestamps) used
          for security, rate-limiting and diagnostics.
        </li>
      </ul>

      <h2>How the scan analyses your photo</h2>
      <p>
        Photos are analysed by an AI vision model (currently Google Gemini, processed by Google on
        our behalf under their API terms) to produce <strong>appearance ratings only</strong> —
        skin, hair, beard and style — and grooming suggestions. The scan is{" "}
        <strong>not a medical assessment</strong>, does not diagnose any condition, and must not be
        relied on as health advice. Photos are not used to train AI models.
      </p>

      <h2>How long we keep photos</h2>
      <ul>
        <li>
          <strong>Unclaimed scans</strong> (you didn't enter your details): the photo and its scores
          are <strong>deleted automatically within 24 hours</strong>.
        </li>
        <li>
          <strong>Saved reports and client scans</strong> are kept so you can track progress across
          rescans, until you ask us to delete them or your relationship with GTB ends.
        </li>
        <li>Photos are stored in private storage in encrypted form; they are never made public.</li>
      </ul>

      <h2>How we use your information</h2>
      <ul>
        <li>To produce your report, roadmap and progress comparisons.</li>
        <li>
          To email you your report and follow-up guidance. Every such email has a one-click
          unsubscribe; opting out never affects service emails to enrolled clients.
        </li>
        <li>To contact you about the GTB programme if you've asked us to, or taken a scan.</li>
        <li>To operate, secure and improve the service.</li>
      </ul>
      <p>We do not sell personal information.</p>

      <h2>Who we share it with</h2>
      <p>
        Only service providers that process data for us: cloud hosting and database (Supabase),
        content delivery (Cloudflare), AI analysis (Google), and email delivery (Mailgun). Each is
        bound to use data only to provide their service to us. We disclose information if required
        by law.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li>Unsubscribe from follow-up emails via the link in any message.</li>
        <li>
          Ask us to access, correct or <strong>delete</strong> your photos and personal information
          at any time by writing to {CONTACT_EMAIL}. We act within 30 days.
        </li>
        <li>Clients can update most details themselves in the portal.</li>
      </ul>

      <h2>Children</h2>
      <p>The service is for adults (18+). We do not knowingly collect information from minors.</p>

      <h2>Contact</h2>
      <p>
        {LEGAL_ENTITY}, {LEGAL_ADDRESS} · {CONTACT_EMAIL}
      </p>
      <p>We may update this policy; the effective date above changes when we do.</p>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Use">
      <p>
        These terms govern your use of the {PRODUCT_NAME}, the client portal and related services
        operated by {LEGAL_ENTITY} ("GTB"). By using them you agree to these terms and to our{" "}
        <Link to="/privacy" className="text-primary underline">
          Privacy Policy
        </Link>
        .
      </p>

      <h2>The scan is guidance, not advice</h2>
      <p>
        The {PRODUCT_NAME} produces <strong>appearance ratings and grooming suggestions</strong>{" "}
        generated by an AI model. Scores are subjective estimates, vary with lighting and framing,
        and are not a medical, dermatological or health assessment. Consult a qualified professional
        for any health concern. Roadmaps and checklists are general guidance you adapt to your own
        situation.
      </p>

      <h2>Your content</h2>
      <p>
        You must only upload photos of yourself, or of people who have agreed to it. You keep
        ownership of your photos and grant us permission to process them to provide the service, as
        described in the Privacy Policy. Do not upload unlawful, offensive or third-party content.
      </p>

      <h2>Fair use</h2>
      <p>
        The scan is free for personal use. Automated, bulk or commercial use, attempts to reverse
        engineer the scoring, or interfering with the service are not permitted, and we may
        rate-limit or block access to protect it.
      </p>

      <h2>Coaching programmes</h2>
      <p>
        Enrolment in a GTB programme is governed by the plan you select and its stated price,
        sessions and schedule, shown in the portal at enrolment. Payment, rescheduling and
        cancellation terms are provided at that point.
      </p>

      <h2>Availability and liability</h2>
      <p>
        We aim to keep the service available but do not guarantee uninterrupted access or specific
        results. To the fullest extent permitted by law, GTB is not liable for indirect or
        consequential losses arising from use of the scan or its suggestions.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms; continued use after a change means you accept it. Questions:{" "}
        {CONTACT_EMAIL}. Governed by the laws of India.
      </p>
    </LegalShell>
  );
}
