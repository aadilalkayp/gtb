import Vision
import CoreImage

/// One live framing verdict, evaluated per video frame.
///
/// This mirrors the SERVER's framing gate (apps/api scan/start: faceDetected,
/// isCloseUp, hairVisible) plus checks the server can't make cheaply
/// (brightness, centering). Passing here means the paid cloud analysis will
/// almost certainly accept the photo — the whole point of the app.
struct FrameVerdict: Equatable {
    struct Check: Equatable, Identifiable {
        let id: String
        let label: String
        let passed: Bool
    }

    var checks: [Check] = []
    var allPassed: Bool { !checks.isEmpty && checks.allSatisfy(\.passed) }
    /// The first failing check's label — the single live hint shown large.
    var hint: String? { checks.first(where: { !$0.passed })?.label }
}

/// Vision-framework analysis of camera frames. Stateless per call; the
/// controller throttles it to a few frames per second.
struct FrameAnalyzer {
    // Thresholds tuned to the server rubric: "face fills roughly a third or
    // more of the frame height" for close-up; headroom above the face box
    // approximates "hair visible, not cropped".
    private static let minFaceHeight: CGFloat = 0.30
    private static let minProfileFaceHeight: CGFloat = 0.18
    private static let minHeadroom: CGFloat = 0.06
    private static let maxCenterOffset: CGFloat = 0.20
    private static let brightnessRange: ClosedRange<Float> = 0.22...0.85
    private static let minBodyHeight: CGFloat = 0.62

    func analyze(_ pixelBuffer: CVPixelBuffer, step: CaptureStep) -> FrameVerdict {
        let brightness = averageLuminance(pixelBuffer)
        switch step {
        case .front:
            return frontVerdict(pixelBuffer, brightness: brightness)
        case .left, .right:
            return profileVerdict(pixelBuffer, brightness: brightness)
        case .fullBody:
            return bodyVerdict(pixelBuffer, brightness: brightness)
        }
    }

    // MARK: Per-step rules

    private func frontVerdict(_ buffer: CVPixelBuffer, brightness: Float) -> FrameVerdict {
        let faces = detectFaces(buffer)
        let face = faces.max(by: { $0.boundingBox.height < $1.boundingBox.height })?.boundingBox
        var v = FrameVerdict()
        v.checks = [
            .init(id: "face", label: "Show your face", passed: faces.count == 1),
            .init(
                id: "close",
                label: "Come closer",
                passed: (face?.height ?? 0) >= Self.minFaceHeight
            ),
            .init(
                id: "hair",
                label: "Tilt up, keep your hair in shot",
                // Vision boxes are normalized, origin bottom-left: headroom is
                // the space between the face box top and the frame top.
                passed: face.map { 1 - $0.maxY >= Self.minHeadroom } ?? false
            ),
            .init(
                id: "center",
                label: "Center yourself",
                passed: face.map { abs($0.midX - 0.5) <= Self.maxCenterOffset } ?? false
            ),
            brightnessCheck(brightness),
        ]
        return v
    }

    private func profileVerdict(_ buffer: CVPixelBuffer, brightness: Float) -> FrameVerdict {
        let faces = detectFaces(buffer)
        let face = faces.max(by: { $0.boundingBox.height < $1.boundingBox.height })?.boundingBox
        var v = FrameVerdict()
        v.checks = [
            .init(id: "face", label: "Keep your head in frame", passed: !faces.isEmpty),
            .init(
                id: "close",
                label: "Come a little closer",
                passed: (face?.height ?? 0) >= Self.minProfileFaceHeight
            ),
            brightnessCheck(brightness),
        ]
        return v
    }

    private func bodyVerdict(_ buffer: CVPixelBuffer, brightness: Float) -> FrameVerdict {
        let request = VNDetectHumanRectanglesRequest()
        request.upperBodyOnly = false
        try? VNImageRequestHandler(cvPixelBuffer: buffer, options: [:]).perform([request])
        let body = request.results?.max(by: { $0.boundingBox.height < $1.boundingBox.height })?.boundingBox
        var v = FrameVerdict()
        v.checks = [
            .init(id: "person", label: "Step into frame", passed: body != nil),
            .init(
                id: "full",
                label: "Step back — head to shoes",
                passed: (body?.height ?? 0) >= Self.minBodyHeight
            ),
            brightnessCheck(brightness),
        ]
        return v
    }

    private func brightnessCheck(_ value: Float) -> FrameVerdict.Check {
        .init(
            id: "light",
            label: value < Self.brightnessRange.lowerBound ? "Find more light" : "Too bright — face away from the light",
            passed: Self.brightnessRange.contains(value)
        )
    }

    // MARK: Vision primitives

    private func detectFaces(_ buffer: CVPixelBuffer) -> [VNFaceObservation] {
        let request = VNDetectFaceRectanglesRequest()
        try? VNImageRequestHandler(cvPixelBuffer: buffer, options: [:]).perform([request])
        return request.results ?? []
    }

    /// Mean luma of a heavily downsampled pass over the luminance plane.
    private func averageLuminance(_ buffer: CVPixelBuffer) -> Float {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(buffer, 0) else { return 0.5 }
        let width = CVPixelBufferGetWidthOfPlane(buffer, 0)
        let height = CVPixelBufferGetHeightOfPlane(buffer, 0)
        let stride = CVPixelBufferGetBytesPerRowOfPlane(buffer, 0)
        let ptr = base.assumingMemoryBound(to: UInt8.self)
        var total = 0
        var count = 0
        for y in Swift.stride(from: 0, to: height, by: 32) {
            for x in Swift.stride(from: 0, to: width, by: 32) {
                total += Int(ptr[y * stride + x])
                count += 1
            }
        }
        return count > 0 ? Float(total) / Float(count) / 255 : 0.5
    }
}
