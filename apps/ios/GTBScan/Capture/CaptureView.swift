import SwiftUI
import AVFoundation

/// Live camera with the on-device capture coach: check chips update per
/// frame, the big hint says the one thing to fix, and the shutter only arms
/// once every check has held for a few frames.
struct CaptureFlowView: View {
    @Environment(ScanFlow.self) private var flow
    @State private var camera = CameraController()
    @State private var flash = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            CameraPreview(session: camera.session)
                .ignoresSafeArea()

            if camera.permissionDenied {
                permissionOverlay
            } else {
                coachOverlay
            }

            if flash {
                Color.white.ignoresSafeArea().transition(.opacity)
            }
        }
        .navigationTitle(flow.currentStep.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    camera.flipCamera()
                } label: {
                    Image(systemName: "arrow.triangle.2.circlepath.camera")
                }
            }
            #if targetEnvironment(simulator)
            // The simulator has no camera; a generated placeholder keeps the
            // whole flow demoable end to end.
            ToolbarItem(placement: .topBarLeading) {
                Button("Use sample") {
                    flow.photos[flow.currentStep] = Self.samplePhoto(for: flow.currentStep)
                    advance()
                }
            }
            #endif
        }
        .task {
            camera.step = flow.currentStep
            await camera.start()
        }
        .onDisappear { camera.stop() }
        .onChange(of: flow.currentStep) { _, step in camera.step = step }
        .alert("Capture failed", isPresented: .init(
            get: { errorMessage != nil },
            set: { if !$0 { errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var coachOverlay: some View {
        VStack {
            // Check chips: live, honest, one per rule.
            if !camera.verdict.checks.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(camera.verdict.checks) { check in
                        Label(check.label, systemImage: check.passed ? "checkmark.circle.fill" : "circle")
                            .font(.footnote.weight(.medium))
                            .foregroundStyle(check.passed ? .green : .white)
                    }
                }
                .padding(10)
                .background(.black.opacity(0.45), in: RoundedRectangle(cornerRadius: 12))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
            }

            Spacer()

            Text(camera.shutterReady ? "Hold it right there" : (camera.verdict.hint ?? flow.currentStep.guidance))
                .font(.headline)
                .foregroundStyle(.white)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(.black.opacity(0.55), in: Capsule())
                .padding(.bottom, 8)

            HStack {
                if !flow.currentStep.required {
                    Button("Skip") { advance() }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                } else {
                    Spacer().frame(maxWidth: .infinity)
                }

                shutterButton

                Text(progressLabel)
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
            }
            .padding(.bottom, 24)
            .padding(.horizontal)
        }
    }

    private var shutterButton: some View {
        Button {
            Task { await takePhoto() }
        } label: {
            ZStack {
                Circle().strokeBorder(.white, lineWidth: 4).frame(width: 76, height: 76)
                Circle()
                    .fill(camera.shutterReady ? Theme.accent(for: flow.type) : .gray.opacity(0.6))
                    .frame(width: 62, height: 62)
            }
        }
        .disabled(!camera.shutterReady)
        .animation(.easeInOut(duration: 0.2), value: camera.shutterReady)
        .accessibilityLabel("Take photo")
    }

    private var permissionOverlay: some View {
        VStack(spacing: 12) {
            Image(systemName: "camera.fill").font(.largeTitle)
            Text("GTB Scan needs the camera to check your framing on this device before anything is uploaded.")
                .multilineTextAlignment(.center)
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(32)
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.black.opacity(0.8))
    }

    private var progressLabel: String {
        let index = CaptureStep.allCases.firstIndex(of: flow.currentStep) ?? 0
        return "\(index + 1)/\(CaptureStep.allCases.count)"
    }

    private func takePhoto() async {
        do {
            let data = try await camera.capturePhoto()
            withAnimation(.easeOut(duration: 0.12)) { flash = true }
            withAnimation(.easeIn(duration: 0.25).delay(0.12)) { flash = false }
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
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {}
}
