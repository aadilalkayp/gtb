import SwiftUI

enum ClientType: String, CaseIterable, Identifiable {
    case groom, bride
    var id: String { rawValue }
    var label: String { self == .groom ? "Groom to be" : "Glow to be" }
}

/// The four capture steps, mirroring the API's photo fields. Front is the
/// only required one; sides sharpen hair/beard scores and the full-body shot
/// unlocks the Style score — same rules as the web funnel.
enum CaptureStep: String, CaseIterable, Identifiable {
    case front, left, right, fullBody

    var id: String { rawValue }
    var required: Bool { self == .front }
    /// Multipart field name in POST /api/scan/start.
    var field: String {
        switch self {
        case .front: "file"
        case .left: "left"
        case .right: "right"
        case .fullBody: "fullBody"
        }
    }
    var title: String {
        switch self {
        case .front: "Front selfie"
        case .left: "Left profile"
        case .right: "Right profile"
        case .fullBody: "Full body"
        }
    }
    var guidance: String {
        switch self {
        case .front: "Face the camera. Fill the frame, hair in shot."
        case .left: "Turn your head to show your left side."
        case .right: "Now the right side."
        case .fullBody: "Step back so your whole outfit is in frame. This unlocks your Style score."
        }
    }
}

@MainActor
@Observable
final class ScanFlow {
    enum Stage {
        case setup, capture, review, teaser, claim, report
    }

    var stage: Stage = .setup

    // Setup
    var type: ClientType = .groom
    var bigDay: Date = Calendar.current.date(byAdding: .day, value: 90, to: .now) ?? .now

    // Captured photos (JPEG data per step)
    var photos: [CaptureStep: Data] = [:]
    var currentStep: CaptureStep = .front

    // Server state
    var teaser: ScanTeaser?
    var scanId: String?
    var report: ScanReport?

    var api: ScanAPI { ScanAPI(baseURL: Settings.apiBaseURL) }

    func restart() {
        photos = [:]
        currentStep = .front
        teaser = nil
        scanId = nil
        report = nil
        stage = .setup
    }
}

/// Configurable endpoints (Settings sheet on the setup screen). Defaults suit
/// local development; point them at the deployed API/web for a device build.
enum Settings {
    @MainActor static var apiBaseURL: URL {
        URL(string: UserDefaults.standard.string(forKey: "apiBaseURL") ?? "") ?? defaultAPI
    }
    @MainActor static var webBaseURL: URL {
        URL(string: UserDefaults.standard.string(forKey: "webBaseURL") ?? "") ?? defaultWeb
    }
    static let defaultAPI = URL(string: "http://localhost:3005")!
    static let defaultWeb = URL(string: "http://localhost:5175")!
}
