# Styling Blueprint and Stylist Chat

**Status:** Approved by GTB 2026-10-06 (all suggested defaults, plus chat with a 12-hour unread email). Built on branch `styling-blueprint`: all four Blueprint sprints and the chat.
**Audience:** Aadil (build) and the GTB founders (product).
**Origin:** GTB's "Styling Blueprint" developer brief (docx) and a six-screen mockup. The brief is the source of truth; the mockup guided the look only. Proposal page with the approved flow and screens: https://claude.ai/artifact/6kHevU3sgCegruycpUHxvS

---

## 1. Summary

The static styling PDF becomes a structured Styling Blueprint inside GTB OS. The client uploads guided photos in the portal; the stylist downloads them, edits them in their own tools, and returns edited photos plus recommendations as a Blueprint. Publishing freezes a version the client sees in the portal and as a generated PDF. Client and stylist can chat throughout.

Groom To Be clients only for now. Glow To Be gets its own version later.

## 2. Decisions (GTB, Oct 2026)

| Topic | Decision |
|---|---|
| Photos | 5 required (front, left side, right side, back of head, full body) plus up to 6 optional (outfits, inspiration) |
| When | Asked for as soon as a stylist is assigned; Home shows a nudge until sent |
| Turnaround | 5 working days from submission; late Blueprints alert Ops Head |
| Retakes | One photo at a time, with a note the client sees |
| New photos after publish | Allowed; the published Blueprint stays visible until the stylist republishes |
| Downloaded photos | GTB devices only; stylists delete local copies once published (copy on the Styling tab) |
| Marketing use | None. Photos serve the client's own Blueprint only |
| Retention | Original and edited photos deleted 6 months after the big day; Blueprint text and PDF stay |
| Who publishes | The assigned stylist, directly. Ops Head and Founder can view and edit any Blueprint |
| Payment | No block; the stylist sees the paid-in-full badge |
| Library | Basic library in v1: products, barber-brief lines, essentials |
| Images | Client's edited photos, product shots or reference images; GTB owns image rights |
| "Under review" | The client has sent photos and is waiting for the stylist |
| Chat | Shared staff/client chat system, only the stylist channel open. Founder/Ops read, never post; the client is told. Images and PDFs up to 10 MB. Reply target 1 working day; client messages unanswered for 2 working days alert Ops. Unread messages to the client are emailed after 12 hours, once, failing silently. Read-only when the programme ends |

## 3. Workflow

`awaiting_photos -> under_review <-> retake_requested -> published`, and `published -> under_review` when the client sends new photos. "Archived" is derived (client status completed or cancelled) and makes everything read-only. The brief's "Draft" is the stylist's working copy: staff see "Draft changes", the client never does.

Side effects:
- First stylist assigned (`/api/clients/assign`): Blueprint created (pre-filled from the Assessment) and the client notified.
- Submit: due date set, stylist notified (admins if no stylist yet).
- Retake: client notified; re-uploading the flagged slot clears it and, once none remain, returns to Under review.
- Publish: version frozen, retakes withdrawn, "Styling guide delivered" ticked on open styling operations, PDF generated (replaces the previous version's PDF), client notified in the portal and by email.

## 4. Data model

`StylingBlueprint` (1 per client: workflow, Style Profile, Style Direction, Hair & Beard, `sectionsDone`, `checkedEssentialIds`), `StylingPhoto` (slot + `styling_photo` Document + retake note), `StylingLook`, `StylingPalette`, `StylingItem` (kind: outfit, footwear, eyewear, product), `StylingEssential`, `StylingBlueprintVersion` (immutable `snapshot` JSON + `pdfDocumentId`), `StylingLibraryItem`.

Chat: `Conversation` (unique per client + `ConversationKind`), `Message` (optional `chat_attachment` Document, `emailAlertedAt`), `ConversationRead` (per user).

Migrations `20261006000000_styling_blueprint` (with a groom-only backfill for clients who already have a stylist) and `20261007000000_chat`.

## 5. Access rules

- The client has **no gateway access** to Blueprint tables. Everything they see comes from `/api/styling/portal`, which returns only the last published snapshot and signs only the images it references.
- Draft content: gateway, admins and the active styling consultant write; other assigned staff read only.
- Workflow fields (status, dates, version, reminders, essentials ticks) are server-written only.
- `styling_photo`, `styling_image` and `chat_attachment` Documents are hidden from the client's and staff's document lists and from the generic signed-URL route; they are signed by their own routes.
- Chat: the client and their stylist read and send; Founder and Ops Head read; nobody else. All writes are server routes.

`buildBlueprintSnapshot` (packages/shared/src/styling.ts) is the single normaliser used by preview and publish, so the preview is exactly what the client gets. It drops blank rows, invalid colours, non-http(s) links and images that are not the client's own styling images.

## 6. Routes

Styling: `GET /api/styling/portal`, `POST /api/styling/photos` (multipart), `photos/remove`, `photos/zip`, `submit`, `retake`, `remind`, `images` (multipart), `media`, `publish`, `pdf`, `essentials`; `GET /api/styling/payment-status` now also covers Blueprint clients.
Chat: `GET|POST /api/messages`, `POST /api/messages/read`, `GET /api/messages/inbox`.
Jobs: `/api/cron/daily` adds photo retention and late-Blueprint alerts; new `/api/cron/hourly` sends the 12-hour unread chat emails.

## 7. Screens

- Portal: Styling tab (groom clients with styling in their plan, a stylist, or a Blueprint): send photos, under review, retake, published Blueprint (My Style, My Looks, Hair & Grooming with "Show to barber", Shopping List with essentials), PDF download, "Ask <stylist>" chat. Home nudge and the Styling ring link.
- Staff: Styling Operations tabs Blueprints (queue), Styling days (old checklist), Library. Client profile Styling tab: photos (download, ZIP, retakes), ten section editors, preview, publish, PDF, messages. Messages inbox in the sidebar with an unread badge. Alerts: late Blueprints, clients waiting for a reply.

## 8. Deployment notes

- Run the Ansible playbook once: it installs `gtb-cron-hourly.service` and `.timer` next to the daily timer.
- `pdfkit` is now in `serverExternalPackages` and its font data plus the Inter fonts are traced into the standalone build. This also fixes payment receipts (Oct review H1), which now print "Rs" because Helvetica has no rupee glyph.
- New dependency: `fflate` (API, ZIP downloads).

## 9. Not built yet

Phase 2 interaction beyond chat (save or like looks, mark items bought, final-look confirmation, styling appointment), AI-drafted suggestions (Phase 3), the Glow To Be version, library images, and opening chat to other roles (add a `ConversationKind`, its policy clause, and a `CHAT_KINDS` entry).
