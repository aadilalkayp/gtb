import SwiftUI

/// The on-device coach, styled like a considered messaging surface: user
/// bubbles take the accent gradient, coach bubbles sit on white cards, and
/// the input bar floats on material above the keyboard.
struct CoachView: View {
    @Environment(ScanFlow.self) private var flow
    @State private var coach = LocalCoach()
    @State private var draft = ""

    private var accent: Color { Theme.accent(for: flow.type) }

    var body: some View {
        ZStack {
            AtelierBackground(type: flow.type)

            switch coach.availability {
            case .checking:
                ProgressView("Waking the on-device model…")
                    .font(.system(size: 13))
                    .tint(accent)
            case .unavailable(let message):
                unavailableView(message)
            case .ready:
                chat
            }
        }
        .task { coach.prepare(report: flow.report, type: flow.type) }
    }

    // MARK: Chat

    private var chat: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        privacyBanner
                            .padding(.top, 8)

                        if coach.turns.isEmpty {
                            starterPrompts
                        }

                        ForEach(coach.turns) { turn in
                            bubble(turn)
                                .transition(.opacity.combined(with: .offset(y: 10)))
                        }

                        if coach.thinking {
                            thinkingIndicator
                                .id("thinking")
                                .transition(.opacity)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
                    .animation(Theme.spring, value: coach.turns)
                    .animation(Theme.springFast, value: coach.thinking)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: coach.turns) {
                    if let last = coach.turns.last {
                        withAnimation(Theme.spring) { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }

            inputBar
        }
    }

    private var privacyBanner: some View {
        HStack(spacing: 6) {
            Image(systemName: "lock.iphone")
                .font(.system(size: 11, weight: .medium))
            Text("Runs on Apple's on-device model. This chat never leaves your phone.")
                .font(.system(size: 12))
        }
        .foregroundStyle(Theme.inkSecondary)
        .frame(maxWidth: .infinity)
        .multilineTextAlignment(.center)
    }

    private var starterPrompts: some View {
        VStack(alignment: .leading, spacing: 8) {
            Overline(text: "Ask me about")
                .padding(.top, 12)
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
                    HStack {
                        Text(prompt)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(Theme.ink)
                        Spacer()
                        Image(systemName: "arrow.up.right")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(accent)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 13)
                    .background {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .fill(.white)
                            .overlay {
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .strokeBorder(Theme.hairline, lineWidth: 1)
                            }
                    }
                }
                .buttonStyle(PressableStyle())
            }
        }
    }

    private func bubble(_ turn: LocalCoach.Turn) -> some View {
        HStack {
            if turn.role == .user { Spacer(minLength: 48) }
            Text(turn.text)
                .font(.system(size: 15))
                .foregroundStyle(turn.role == .user ? .white : Theme.ink)
                .padding(.horizontal, 15)
                .padding(.vertical, 11)
                .background {
                    if turn.role == .user {
                        RoundedRectangle(cornerRadius: 19, style: .continuous)
                            .fill(Theme.accentGradient(for: flow.type))
                    } else {
                        RoundedRectangle(cornerRadius: 19, style: .continuous)
                            .fill(.white)
                            .overlay {
                                RoundedRectangle(cornerRadius: 19, style: .continuous)
                                    .strokeBorder(Theme.hairline, lineWidth: 1)
                            }
                    }
                }
            if turn.role == .coach { Spacer(minLength: 48) }
        }
        .id(turn.id)
        .frame(maxWidth: .infinity, alignment: turn.role == .user ? .trailing : .leading)
    }

    private var thinkingIndicator: some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.small).tint(accent)
            Text("Thinking, on this phone")
                .font(.system(size: 12))
                .foregroundStyle(Theme.inkSecondary)
        }
        .padding(.horizontal, 4)
    }

    private var inputBar: some View {
        HStack(spacing: 10) {
            TextField("Skin, hair, outfits…", text: $draft, axis: .vertical)
                .font(.system(size: 15))
                .lineLimit(1...4)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background {
                    Capsule().fill(.white)
                        .overlay { Capsule().strokeBorder(Theme.hairline, lineWidth: 1) }
                }

            Button {
                let question = draft
                draft = ""
                Task { await coach.ask(question) }
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 38, height: 38)
                    .background(Theme.accentGradient(for: flow.type), in: Circle())
            }
            .buttonStyle(PressableStyle())
            .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty || coach.thinking)
            .opacity(draft.trimmingCharacters(in: .whitespaces).isEmpty ? 0.4 : 1)
            .animation(.easeOut(duration: 0.15), value: draft.isEmpty)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.ultraThinMaterial)
    }

    // MARK: Unavailable

    private func unavailableView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "iphone.gen3")
                .font(.system(size: 34))
                .foregroundStyle(Theme.inkSecondary.opacity(0.6))
            Text(message)
                .font(.system(size: 15))
                .foregroundStyle(Theme.inkSecondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 300)
            if let scanId = flow.report?.scanId {
                Link(destination: Settings.webBaseURL.appending(path: "/scan/r/\(scanId)")) {
                    Label("Open the full coach on the web", systemImage: "arrow.up.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(accent)
                }
                .buttonStyle(PressableStyle())
            }
        }
        .padding(32)
    }
}
