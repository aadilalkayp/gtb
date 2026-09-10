# GTB Scan — iOS companion

Native SwiftUI companion for the Transformation Readiness Scan funnel. Two
things justify its existence over the web funnel:

1. **On-device capture coach.** The Vision framework checks framing live,
   before the shutter: face present, close enough (face ≥ ~30% of frame
   height, mirroring the server rubric), hair headroom, centering, and
   brightness; profile and full-body steps get their own rules
   (`VNDetectHumanRectangles` for the outfit shot). The shutter only arms
   after every check holds for several consecutive frames, so photos arrive
   at `/api/scan/start` pre-validated and the paid Gemini analysis almost
   never rejects a framing. Nothing leaves the phone until the person taps
   Upload on the review screen.
2. **On-device coach (Apple Foundation Models, iOS 26+).** Tier-1 grooming
   Q&A runs entirely on the phone: free, instant, offline, private, with the
   same scope guardrails as the server coach and a bundled KB snapshot.
   Where the model is unavailable (older device, Apple Intelligence off) the
   UI degrades to a link to the tier-2 server coach on the web report page.

The app is anonymous-funnel only — it speaks the same public API as `/scan`
on the web: multipart `POST /api/scan/start` → teaser → `POST /api/scan/claim`
→ full report. No auth, no new server surface.

## Building

The Xcode project is generated, not committed:

```bash
brew install xcodegen   # once
cd apps/ios
xcodegen generate
open GTBScan.xcodeproj
```

Or from the CLI:

```bash
xcodebuild -project GTBScan.xcodeproj -scheme GTBScan \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

Endpoints default to local dev (`http://localhost:3005` API,
`http://localhost:5175` web) and are editable in the gear menu on the first
screen — set the deployed URLs there for a device build.

## Simulator notes

- The simulator has no camera: the capture screen shows a "Use sample"
  toolbar button (simulator builds only) that injects a placeholder photo so
  the full flow is demoable. The live capture coach needs a real device.
- The upload step needs the API running (`pnpm dev:api`); without a
  `GEMINI_API_KEY` the server stubs scoring deterministically, which is fine
  for flow testing. Note the server sniffs magic bytes, so the sample photos
  (real JPEGs) pass.
- Apple's on-device model is generally unavailable in the simulator; the
  coach tab shows its graceful-degradation state there.

## Layout

- `project.yml` — XcodeGen spec (Info.plist keys, Swift 5 language mode; the
  camera pipeline is documented `nonisolated(unsafe)` hand-verified onto its
  session queue)
- `GTBScan/App` — entry, flow state machine, theme, endpoint settings
- `GTBScan/Capture` — `FrameAnalyzer` (Vision rules), `CameraController`
  (AVCaptureSession + verdict stream), `CaptureView` (coach overlay UI)
- `GTBScan/Models` — API payload types + multipart client
- `GTBScan/Views` — setup, review/upload, teaser, claim, report
- `GTBScan/Coach` — `LocalCoach` (Foundation Models session + KB snapshot)
