# Pre-Consultation Assessment

GTB's "Pre-Consultation Assessment & Consultant Document Workflow" spec (Oct 2026), as built.
GTB's answers to the open questions are recorded at the end.

## Client flow

Onboarding step 1 (before plan and payment) is now the Pre-Consultation Assessment
(`components/assessment/PreConsultationForm.tsx`), about 3 to 5 minutes:

1. **Skincare**: skin type, up to 3 concerns ("Other" asks for text), optional routine, allergy Yes/No (+ details), dermatological treatment Yes/No (+ details).
2. **Skin photos**: FRONT / LEFT / RIGHT, each mandatory, JPG/PNG, preview, replace/remove before submission. The original is stored byte-for-byte; the browser also uploads a ~1600px JPEG preview used on screen and in the PDF.
3. **Fitness**: activity level, single primary goal ("Other" asks for text), height, weight, injury/condition Yes/No (+ details).
4. **Nutrition**: dietary preference (incl. Eggetarian; "Other" asks for text), optional allergies/restrictions.
5. **Consent**: both confirmations required.

Validation lives in `packages/shared/src/preConsultation.ts` and runs in the browser and again in
`POST /api/assessment/submit` (which also requires all three photos). Clients have no gateway write
access to `Assessment`; every write goes through `/api/assessment/*`.

**Editing:** answers and photos stay editable until the client's payment is in (the wizard's usual
lock). After that the form is locked; the founder or ops head can **Reopen** it from the client's
Pre-consultation tab, which asks the client (notification + portal home card) to resubmit at
`/portal/assessment`. Existing clients who filled the older form are not asked to redo it; staff see
their old answers.

## Staff side

- **Client profile → Pre-consultation tab** (founder, ops head, and the client's assigned CRO,
  skincare consultant and fitness trainer only; coaches and stylists no longer see the assessment):
  answers, the three photos (click opens the original), View / Download PDF, Reopen (admins).
- **PDF** (`GET /api/assessment/pdf`, `lib/assessmentPdf.ts`): rendered on demand from the stored
  answers, so the assigned consultants and package are always current. Named
  `GTB_Pre_Consultation_<Name>_<ClientID>_<YYYY-MM-DD>.pdf`, branded Groom To Be (teal) or Glow To Be
  (rose). Internal: never offered to the client.
- **Notifications** (in-app + email) on submission go to the operations team (ops heads; founders if
  none) plus the assigned skincare consultant and fitness trainer. A skincare consultant or fitness
  trainer assigned later is told the assessment is ready.
- **Documents tab → timeline**: entries grouped by day, newest first: the system-generated
  assessment, plan versions (Version N, Active / Superseded, uploaded by, description) and other uploads.
- **Upload Consultation Plan PDF**: skincare or fitness plan, optional title, PDF only. Available on the
  Documents tab (admins: both; skincare consultant: skincare; fitness trainer: fitness), on
  `/documents` (pick client, then type), and in the session-complete dialog.

## Versioning

`Document.version` + `Document.status` (`active` | `superseded`) + `Document.description`. Uploads of
`skincare_plan`, `fitness_plan` and `nutrition_plan` (series per fitness plan) take the next version
and supersede the previous one; nothing is deleted (only founder/ops can delete documents). The
client sees only active versions (Document read policy + signed-url route). The migration is
additive only and does not touch existing rows: plan PDFs uploaded before it keep `version` null and
`active`; the next upload of that type becomes version 1 and marks them superseded. Diet plans no
longer replace the old file.

## Data

- `Assessment`: new columns `skinConcernOther`, `skinAllergyFlag`, `dermTreatmentFlag`,
  `activityLevel`, `fitnessGoal`, `fitnessGoalOther`, `healthConditionFlag`,
  `dietaryPreferenceOther`, `dietaryRestrictions`, `consentAccuracy`, `consentProfessionalReview`,
  `submittedAt`, `reopenedAt`. Details reuse `allergies`, `dermatologicalNotes`, `healthConditions`.
  Older columns (age, gender, styling questions, fitnessLevel, fitnessGoals) are kept for existing clients.
- `SkinPhoto` (assessment, angle, document, previewPath), unique per assessment + angle.
- `DocumentType.skin_photo`, `DocumentStatus`, `SkinPhotoAngle` enums.
- Migration `20261008000000_pre_consultation_assessment`, generated with `prisma migrate diff` from a
  database at the previous head. Prisma's proposed drop of the raw-SQL `coach_article_embeddings`
  table was removed (it is intentionally outside the schema).
- Audit: captured writes get verbs `assessment.submitted`, `assessment.reopened`,
  `assessment.photo_uploaded`, `assessment.photo_removed`; PDF opens log `document.downloaded`.

## GTB decisions (Oct 2026)

| Question | Answer |
| --- | --- |
| Where in the flow | First onboarding step, replacing the old assessment |
| Old questions (age, gender, profile photo, styling) | Removed from the form; existing answers kept |
| Who handles the PDFs | Operations team for skincare (ops head notified and uploads; skincare consultant may too) |
| Plans | Separate skincare and fitness plans, versioned |
| Who sees photos / health answers | Founder, ops head, CRO, skincare consultant, fitness trainer. Deleting stays founder / ops head |
| Client visibility | Latest consultation plan only; assessment PDF is internal |
| Editing / existing clients | Locked after submission (admin can reopen); existing clients not asked to redo it |
| Session notes | Kept as a short internal note; the plan PDF is the official plan |
| Brands | Both Groom To Be and Glow To Be |

A lead who has uploaded skin photos has documents, so the founder-only lead deletion (which refuses
leads with documents) will refuse them too.
