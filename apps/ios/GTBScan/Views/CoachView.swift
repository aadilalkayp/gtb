import SwiftUI

struct CoachView: View {
    @Environment(ScanFlow.self) private var flow
    @State private var coach = LocalCoach()
    @State private var draft = ""

    var body: some View {
        VStack(spacing: 0) {
            switch coach.availability {
            case .checking:
                Spacer()
                ProgressView("Checking the on-device model…")
                Spacer()
            case .unavailable(let message):
                unavailableView(message)
            case .ready:
                chat
            }
        }
        .background(Theme.paper)
        .task { coach.prepare(report: flow.report, type: flow.type) }
    }

    private var chat: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) {
                        privacyBanner
                        if coach.turns.isEmpty {
                            starterPrompts
                        }
                        ForEach(coach.turns) { turn in
                            bubble(turn)
                        }
                        if coach.thinking {
                            HStack {
                                ProgressView()
                                Text("Thinking on this phone…")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .id("thinking")
                        }
                    }
                    .padding()
                }
                .onChange(of: coach.turns) {
                    if let last = coach.turns.last {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }

            HStack(spacing: 8) {
                TextField("Ask about skin, hair, outfits…", text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(1...4)
                Button {
                    let question = draft
                    draft = ""
                    Task { await coach.ask(question) }
                } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.title2)
                }
                .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty || coach.thinking)
            }
            .padding()
            .background(.white)
        }
    }

    private var privacyBanner: some View {
        Label(
            "Answers come from Apple's on-device model. This chat never leaves your phone.",
            systemImage: "lock.iphone"
        )
        .font(.caption)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var starterPrompts: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(
                [
                    "What should my daily routine be?",
                    "When is my last haircut before the big day?",
                    "What colours suit photos best?",
                ], id: \.self
            ) { prompt in
                Button {
                    Task { await coach.ask(prompt) }
                } label: {
                    Text(prompt)
                        .font(.subheadline)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.white, in: Capsule())
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.top, 8)
    }

    private func bubble(_ turn: LocalCoach.Turn) -> some View {
        HStack {
            if turn.role == .user { Spacer(minLength: 40) }
            Text(turn.text)
                .font(.subheadline)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    turn.role == .user ? Theme.accent(for: flow.type).opacity(0.15) : .white,
                    in: RoundedRectangle(cornerRadius: 14)
                )
            if turn.role == .coach { Spacer(minLength: 40) }
        }
        .id(turn.id)
        .frame(maxWidth: .infinity, alignment: turn.role == .user ? .trailing : .leading)
    }

    private func unavailableView(_ message: String) -> some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "iphone.slash")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            if let scanId = flow.report?.scanId {
                Link(destination: Settings.webBaseURL.appending(path: "/scan/r/\(scanId)")) {
                    Label("Open the full coach on the web", systemImage: "safari")
                        .font(.subheadline.weight(.medium))
                }
            }
            Spacer()
        }
    }
}
