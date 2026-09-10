import SwiftUI

/// GTB Scan — native companion for the Transformation Readiness Scan.
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
                .tint(Theme.accent(for: flow.type))
                .preferredColorScheme(.light)
        }
    }
}

struct RootView: View {
    @Environment(ScanFlow.self) private var flow

    var body: some View {
        NavigationStack {
            ZStack {
                // Stage transitions share one spring: new screens rise in,
                // old ones settle back — a page turn, not a teleport.
                switch flow.stage {
                case .setup: SetupView().transition(stageTransition)
                case .capture: CaptureFlowView().transition(stageTransition)
                case .review: ReviewUploadView().transition(stageTransition)
                case .teaser: TeaserView().transition(stageTransition)
                case .claim: ClaimView().transition(stageTransition)
                case .report: ReportTabsView().transition(stageTransition)
                }
            }
            .animation(Theme.spring, value: flow.stage)
        }
    }

    private var stageTransition: AnyTransition {
        .asymmetric(
            insertion: .opacity.combined(with: .offset(y: 16)),
            removal: .opacity
        )
    }
}
