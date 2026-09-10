import SwiftUI

/// GTB Scan — native companion for the Transformation Readiness Scan funnel.
///
/// The one thing this app does better than the web funnel: an on-device
/// capture coach. The Vision framework checks framing, headroom and light
/// LIVE before the shutter, so photos arrive at the server pre-validated and
/// the (paid) cloud analysis almost never rejects them. Nothing leaves the
/// phone until the person taps Upload.
@main
struct GTBScanApp: App {
    @State private var flow = ScanFlow()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(flow)
                .tint(Theme.accent)
                .preferredColorScheme(.light)
        }
    }
}

/// Warm-neutral palette echoing the web app's "Atelier" design language.
enum Theme {
    static let accent = Color(red: 0.06, green: 0.46, blue: 0.43) // teal
    static let rose = Color(red: 0.76, green: 0.32, blue: 0.40)
    static let paper = Color(red: 0.98, green: 0.97, blue: 0.95)
    static let ink = Color(red: 0.13, green: 0.12, blue: 0.11)

    static func accent(for type: ClientType) -> Color {
        type == .bride ? rose : accent
    }
}

struct RootView: View {
    @Environment(ScanFlow.self) private var flow

    var body: some View {
        NavigationStack {
            Group {
                switch flow.stage {
                case .setup: SetupView()
                case .capture: CaptureFlowView()
                case .review: ReviewUploadView()
                case .teaser: TeaserView()
                case .claim: ClaimView()
                case .report: ReportTabsView()
                }
            }
            .background(Theme.paper.ignoresSafeArea())
        }
    }
}
