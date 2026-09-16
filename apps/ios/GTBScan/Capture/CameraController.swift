import AVFoundation
import UIKit

/// Owns the capture session, streams framing verdicts from a video output,
/// and takes stills. All session work runs on a private queue; published
/// state hops to the main actor for SwiftUI.
@MainActor
@Observable
final class CameraController: NSObject {
    // The AVFoundation objects are configured and used ONLY on sessionQueue
    // (plus the thread-safe preview-layer attach); nonisolated(unsafe) states
    // that hand-verified contract to the compiler.
    nonisolated(unsafe) let session = AVCaptureSession()

    var verdict = FrameVerdict()
    var permissionDenied = false
    var usingFrontCamera = true
    /// The step currently being framed; drives which checks run.
    var step: CaptureStep = .front {
        didSet { verdictStreak = 0 }
    }
    /// Shutter unlocks only after the checks hold for a few consecutive
    /// frames — stops a lucky single frame from enabling a bad photo.
    var shutterReady: Bool { verdictStreak >= 3 }

    private var verdictStreak = 0
    private let analyzer = FrameAnalyzer()
    nonisolated(unsafe) private let photoOutput = AVCapturePhotoOutput()
    nonisolated(unsafe) private let videoOutput = AVCaptureVideoDataOutput()
    private nonisolated let sessionQueue = DispatchQueue(label: "gtb.camera")
    private var lastAnalysis = Date.distantPast
    private var photoContinuation: CheckedContinuation<Data, Error>?

    func start() async {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .notDetermined:
            guard await AVCaptureDevice.requestAccess(for: .video) else {
                permissionDenied = true
                return
            }
        case .denied, .restricted:
            permissionDenied = true
            return
        default: break
        }
        let front = usingFrontCamera
        sessionQueue.async { [self] in configure(front: front) }
    }

    func stop() {
        sessionQueue.async { [self] in
            if session.isRunning { session.stopRunning() }
        }
    }

    func flipCamera() {
        usingFrontCamera.toggle()
        let front = usingFrontCamera
        sessionQueue.async { [self] in configure(front: front) }
    }

    func capturePhoto() async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            photoContinuation = continuation
            let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
            photoOutput.capturePhoto(with: settings, delegate: self)
        }
    }

    nonisolated private func configure(front: Bool) {
        session.beginConfiguration()
        session.sessionPreset = .photo
        for input in session.inputs { session.removeInput(input) }
        guard
            let device = AVCaptureDevice.default(
                .builtInWideAngleCamera, for: .video, position: front ? .front : .back
            ),
            let input = try? AVCaptureDeviceInput(device: device),
            session.canAddInput(input)
        else {
            session.commitConfiguration()
            return
        }
        session.addInput(input)
        if !session.outputs.contains(photoOutput), session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
        }
        if !session.outputs.contains(videoOutput), session.canAddOutput(videoOutput) {
            videoOutput.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
            ]
            videoOutput.setSampleBufferDelegate(self, queue: sessionQueue)
            session.addOutput(videoOutput)
        }
        // Portrait: the analyzer's height/headroom rules assume upright frames.
        if let connection = videoOutput.connection(with: .video) {
            connection.videoRotationAngle = 90
        }
        session.commitConfiguration()
        if !session.isRunning { session.startRunning() }
    }
}

extension CameraController: AVCaptureVideoDataOutputSampleBufferDelegate {
    nonisolated func captureOutput(
        _ output: AVCaptureOutput,
        didOutput sampleBuffer: CMSampleBuffer,
        from connection: AVCaptureConnection
    ) {
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        Task { @MainActor in
            // Throttle Vision to ~4 fps — plenty for live guidance, kind to battery.
            guard Date().timeIntervalSince(lastAnalysis) > 0.25 else { return }
            lastAnalysis = Date()
            let currentStep = step
            let verdict = await Task.detached(priority: .userInitiated) { [analyzer] in
                analyzer.analyze(pixelBuffer, step: currentStep)
            }.value
            guard currentStep == step else { return }
            self.verdict = verdict
            verdictStreak = verdict.allPassed ? verdictStreak + 1 : 0
        }
    }
}

extension CameraController: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(
        _ output: AVCapturePhotoOutput,
        didFinishProcessingPhoto photo: AVCapturePhoto,
        error: (any Error)?
    ) {
        let data = photo.fileDataRepresentation()
        Task { @MainActor in
            if let error {
                photoContinuation?.resume(throwing: error)
            } else if let data {
                photoContinuation?.resume(returning: data)
            } else {
                photoContinuation?.resume(
                    throwing: APIError(message: "Could not read the photo", isFramingRejection: false)
                )
            }
            photoContinuation = nil
        }
    }
}
