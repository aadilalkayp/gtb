import SwiftUI
import AVFoundation

/// The shooting floor: full dark chrome around a framed viewfinder. The
/// on-device coach speaks through three signals that always agree —
/// check pills above the frame, corner brackets that catch the accent when
/// framing locks, and one hint line saying the single thing to fix.
struct CaptureFlowView: View {
    @Environment(ScanFlow.self) private var flow
    @State private var camera = CameraController()
    @State private var flash = false
    @State private var errorMessage: String?

    private var accent: Color { Theme.accent(for: flow.type) }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                    .padding(.horizontal, 20)
                    .padding(.bottom, 14)

                viewfinder
                    .padding(.horizontal, 12)

                Spacer(minLength: 0)

                hintLine
                    .padding(.bottom, 18)

                controls
                    .padding(.horizontal, 28)
                    .padding(.bottom, 10)
            }

            if flash {
                Color.white.ignoresSafeArea().transition(.opacity)
            }

            if camera.permissionDenied {
                permissionOverlay
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .statusBarHidden()
        .task {
            camera.step = flow.currentStep
            await camera.start()
        }
        .onDisappear { camera.stop() }
        .onChange(of: flow.currentStep) { _, step in camera.step = step }
        .sensoryFeedback(.success, trigger: camera.shutterReady) { _, ready in ready }
        .alert("Capture failed", isPresented: .init(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    // MARK: Header — step identity + progress

    private var header: some View {
        VStack(spacing: 10) {
            HStack {
                Button {
                    flow.stage = flow.photos.isEmpty ? .setup : .review
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                        .frame(width: 34, height: 34)
                        .background(.white.opacity(0.12), in: Circle())
                }
                .buttonStyle(PressableStyle())

                Spacer()

                StepDots(current: flow.currentStep, captured: Set(flow.photos.keys), accent: accent)

                Spacer()

                Button {
                    camera.flipCamera()
                } label: {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(.white.opacity(0.85))
                        .frame(width: 34, height: 34)
                        .background(.white.opacity(0.12), in: Circle())
                }
                .buttonStyle(PressableStyle())
            }

            VStack(spacing: 2) {
                Text(flow.currentStep.title)
                    .font(.display(24))
                    .foregroundStyle(.white)
                    .contentTransition(.opacity)
                Text(flow.currentStep.required ? "Required" : "Optional — sharpens your score")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.white.opacity(0.55))
            }
            .animation(Theme.springFast, value: flow.currentStep)
        }
        .padding(.top, 8)
    }

    // MARK: Viewfinder — the framed stage

    private var viewfinder: some View {
        ZStack {
            CameraPreview(session: camera.session)
                .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))

            // Corner brackets: white while composing, accent when locked.
            CornerBrackets(color: camera.shutterReady ? accent : .white.opacity(0.7))
                .padding(26)
                .animation(Theme.springFast, value: camera.shutterReady)

            // Check pills float inside the top of the frame.
            if !camera.verdict.checks.isEmpty {
                VStack {
                    HStack(spacing: 6) {
                        ForEach(camera.verdict.checks) { check in
                            CheckPill(check: check, accent: accent)
                        }
                    }
                    .padding(.top, 14)
                    Spacer()
                }
                .transition(.opacity)
            }
        }
        .aspectRatio(3 / 4, contentMode: .fit)
        .animation(Theme.springFast, value: camera.verdict.checks.isEmpty)
    }

    // MARK: Hint — one line, the single thing to fix

    private var hintLine: some View {
        Text(camera.shutterReady ? "Hold it right there" : (camera.verdict.hint ?? flow.currentStep.guidance))
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(camera.shutterReady ? accent : .white)
            .contentTransition(.opacity)
            .animation(.easeOut(duration: 0.18), value: camera.verdict.hint)
            .animation(Theme.springFast, value: camera.shutterReady)
            .frame(minHeight: 22)
            .padding(.horizontal, 32)
            .multilineTextAlignment(.center)
    }

    // MARK: Controls

    private var controls: some View {
        ZStack {
            HStack {
                #if targetEnvironment(simulator)
                // The simulator has no camera; a generated placeholder keeps
                // the whole flow demoable end to end.
                Button("Sample") {
                    flow.photos[flow.currentStep] = Self.samplePhoto(for: flow.currentStep)
                    advance()
                }
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(.white.opacity(0.7))
                .buttonStyle(PressableStyle())
                #endif

                Spacer()

                if !flow.currentStep.required {
                    Button("Skip") { advance() }
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(.white.opacity(0.7))
                        .buttonStyle(PressableStyle())
                }
            }

            ShutterButton(armed: camera.shutterReady, accent: accent) {
                Task { await takePhoto() }
            }
        }
        .frame(height: 92)
    }

    private var permissionOverlay: some View {
        VStack(spacing: 16) {
            Image(systemName: "camera.fill")
                .font(.system(size: 34))
                .foregroundStyle(.white.opacity(0.8))
            Text("GTB Scan needs the camera to check your framing on this device before anything is uploaded.")
                .font(.system(size: 15))
                .foregroundStyle(.white.opacity(0.8))
                .multilineTextAlignment(.center)
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.black)
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(.white, in: Capsule())
            .buttonStyle(PressableStyle())
        }
        .padding(36)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.black.opacity(0.85))
        .ignoresSafeArea()
    }

    // MARK: Actions

    private func takePhoto() async {
        do {
            let data = try await camera.capturePhoto()
            withAnimation(.easeOut(duration: 0.1)) { flash = true }
            withAnimation(.easeIn(duration: 0.25).delay(0.1)) { flash = false }
            flow.photos[flow.currentStep] = data
            advance()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    #if targetEnvironment(simulator)
    private static func samplePhoto(for step: CaptureStep) -> Data {
        let size = CGSize(width: 900, height: 1200)
        let renderer = UIGraphicsImageRenderer(size: size)
        let image = renderer.image { context in
            UIColor(red: 0.85, green: 0.82, blue: 0.78, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            let text = "Sample\n\(step.title)" as NSString
            let style = NSMutableParagraphStyle()
            style.alignment = .center
            text.draw(
                in: CGRect(x: 0, y: 520, width: 900, height: 200),
                withAttributes: [
                    .font: UIFont.systemFont(ofSize: 64, weight: .semibold),
                    .foregroundColor: UIColor.darkGray,
                    .paragraphStyle: style,
                ]
            )
        }
        return image.jpegData(compressionQuality: 0.85) ?? Data()
    }
    #endif

    private func advance() {
        let steps = CaptureStep.allCases
        if let index = steps.firstIndex(of: flow.currentStep), index + 1 < steps.count {
            flow.currentStep = steps[index + 1]
        } else {
            flow.stage = .review
        }
    }
}

// MARK: - Pieces

/// One live check: icon-only when passing (quiet), icon + label when it is
/// the thing to fix.
struct CheckPill: View {
    let check: FrameVerdict.Check
    let accent: Color

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: check.passed ? "checkmark" : icon)
                .font(.system(size: 10, weight: .bold))
        }
        .foregroundStyle(check.passed ? accent : .white)
        .frame(width: 26, height: 26)
        .background(
            check.passed ? AnyShapeStyle(.white.opacity(0.9)) : AnyShapeStyle(.black.opacity(0.35)),
            in: Circle()
        )
        .animation(Theme.springFast, value: check.passed)
    }

    private var icon: String {
        switch check.id {
        case "face", "person": "person.fill"
        case "close", "full": "arrow.down.left.and.arrow.up.right"
        case "hair": "arrow.up.to.line"
        case "center": "align.horizontal.center"
        case "light": "sun.max.fill"
        default: "circle"
        }
    }
}

/// Four viewfinder corners, drawn as one shape so they tint together.
struct CornerBrackets: View {
    let color: Color

    var body: some View {
        GeometryReader { geo in
            let length: CGFloat = 26
            let w = geo.size.width
            let h = geo.size.height
            Path { p in
                for (x, y, dx, dy) in [
                    (0.0, 0.0, 1.0, 1.0), (w, 0.0, -1.0, 1.0),
                    (0.0, h, 1.0, -1.0), (w, h, -1.0, -1.0),
                ] {
                    p.move(to: CGPoint(x: x, y: y + dy * length))
                    p.addLine(to: CGPoint(x: x, y: y))
                    p.addLine(to: CGPoint(x: x + dx * length, y: y))
                }
            }
            .stroke(color, style: StrokeStyle(lineWidth: 3, lineCap: .round))
        }
        .allowsHitTesting(false)
    }
}

/// Step progress: a dot per angle. Filled = captured, ring = current.
struct StepDots: View {
    let current: CaptureStep
    let captured: Set<CaptureStep>
    let accent: Color

    var body: some View {
        HStack(spacing: 8) {
            ForEach(CaptureStep.allCases) { step in
                Circle()
                    .fill(captured.contains(step) ? accent : .white.opacity(step == current ? 0.9 : 0.3))
                    .frame(width: step == current ? 8 : 6, height: step == current ? 8 : 6)
                    .animation(Theme.springFast, value: current)
            }
        }
    }
}

/// Classic camera shutter: white ring, inner disc that takes the accent and
/// breathes gently when the coach arms it.
struct ShutterButton: View {
    let armed: Bool
    let accent: Color
    let action: () -> Void
    @State private var breathing = false

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .strokeBorder(.white, lineWidth: 4)
                    .frame(width: 78, height: 78)
                Circle()
                    .fill(armed ? AnyShapeStyle(accent) : AnyShapeStyle(.white.opacity(0.35)))
                    .frame(width: 62, height: 62)
                    .scaleEffect(armed && breathing ? 1.05 : 1)
            }
        }
        .buttonStyle(PressableStyle())
        .disabled(!armed)
        .animation(Theme.springFast, value: armed)
        .onChange(of: armed) { _, isArmed in
            if isArmed {
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                    breathing = true
                }
            } else {
                withAnimation(.easeOut(duration: 0.2)) { breathing = false }
            }
        }
        .accessibilityLabel("Take photo")
    }
}

/// AVCaptureVideoPreviewLayer bridged into SwiftUI.
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        view.backgroundColor = UIColor(white: 0.08, alpha: 1)
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}
}
