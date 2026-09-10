import SwiftUI

/// Contact sheet: review the set, then upload. Nothing has left the phone
/// before the button on this screen — the privacy contract the capture flow
/// promises.
struct ReviewUploadView: View {
    @Environment(ScanFlow.self) private var flow
    @State private var uploading = false
    @State private var errorMessage: String?
    @State private var shown = false

    var body: some View {
        ZStack {
            AtelierBackground(type: flow.type)

            VStack(spacing: 0) {
                VStack(spacing: 6) {
                    Overline(text: "Contact sheet")
                    Text("Your set")
                        .font(.display(34))
                        .foregroundStyle(Theme.ink)
                }
                .padding(.top, 8)
                .enters(0, shown: shown)

                ScrollView {
                    LazyVGrid(
                        columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)],
                        spacing: 14
                    ) {
                        ForEach(Array(CaptureStep.allCases.enumerated()), id: \.element) { index, step in
                            PhotoCell(step: step, data: flow.photos[step]) {
                                flow.currentStep = step
                                flow.stage = .capture
                            }
                            .enters(index + 1, shown: shown)
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 12)
                }
                .scrollBounceBehavior(.basedOnSize)

                VStack(spacing: 12) {
                    if let errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.rose)
                            .multilineTextAlignment(.leading)
                            .transition(.opacity.combined(with: .offset(y: 6)))
                    }

                    PrimaryButton(
                        title: "Upload & reveal my score",
                        loading: uploading,
                        type: flow.type
                    ) {
                        Task { await upload() }
                    }
                    .disabled(uploading || flow.photos[.front] == nil)
                    .opacity(flow.photos[.front] == nil ? 0.5 : 1)

                    Label {
                        Text("\(flow.photos.count) photo\(flow.photos.count == 1 ? "" : "s") ready · uploads only when you tap")
                    } icon: {
                        Image(systemName: "lock.fill").font(.system(size: 10))
                    }
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.inkSecondary)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
                .animation(Theme.springFast, value: errorMessage)
                .enters(5, shown: shown)
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Retake all") {
                    flow.photos = [:]
                    flow.currentStep = .front
                    flow.stage = .capture
                }
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(Theme.inkSecondary)
            }
        }
        .onAppear { shown = true }
    }

    private func upload() async {
        uploading = true
        withAnimation(Theme.springFast) { errorMessage = nil }
        defer { uploading = false }
        do {
            let response = try await flow.api.startScan(
                photos: flow.photos, type: flow.type, bigDay: flow.bigDay
            )
            flow.scanId = response.scanId
            flow.teaser = response.teaser
            flow.stage = .teaser
        } catch let error as APIError where error.isFramingRejection {
            // The live coach should make this rare; when the server still
            // rejects, route straight back to the front-photo capture.
            withAnimation(Theme.springFast) { errorMessage = error.message }
            flow.currentStep = .front
        } catch {
            withAnimation(Theme.springFast) { errorMessage = error.localizedDescription }
        }
    }
}

/// One frame of the contact sheet: photo (or dashed empty state), angle
/// label, retake affordance on the photo itself.
struct PhotoCell: View {
    let step: CaptureStep
    let data: Data?
    let retake: () -> Void

    var body: some View {
        Button(action: retake) {
            VStack(alignment: .leading, spacing: 8) {
                ZStack {
                    if let data, let image = UIImage(data: data) {
                        Color.clear
                            .aspectRatio(3 / 4, contentMode: .fit)
                            .overlay {
                                Image(uiImage: image)
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .overlay(alignment: .bottomTrailing) {
                                Image(systemName: "arrow.counterclockwise")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(.white)
                                    .frame(width: 28, height: 28)
                                    .background(.black.opacity(0.45), in: Circle())
                                    .padding(8)
                            }
                    } else {
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .strokeBorder(
                                Theme.inkSecondary.opacity(0.35),
                                style: StrokeStyle(lineWidth: 1.5, dash: [6, 5])
                            )
                            .aspectRatio(3 / 4, contentMode: .fit)
                            .overlay {
                                VStack(spacing: 6) {
                                    Image(systemName: "plus")
                                        .font(.system(size: 20, weight: .medium))
                                    Text(step.required ? "Required" : "Optional")
                                        .font(.system(size: 11, weight: .medium))
                                }
                                .foregroundStyle(Theme.inkSecondary)
                            }
                    }
                }
                .shadow(color: .black.opacity(data == nil ? 0 : 0.10), radius: 12, y: 6)

                Text(step.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(Theme.ink)
            }
        }
        .buttonStyle(PressableStyle())
    }
}

// MARK: - The reveal

/// The score reveal is the emotional peak of the funnel: a slow ring sweep,
/// a counting number, one haptic beat when it lands. Rare moment, so it may
/// take its time.
struct TeaserView: View {
    @Environment(ScanFlow.self) private var flow
    @State private var shown = false
    @State private var landed = false

    var body: some View {
        ZStack {
            AtelierBackground(type: flow.type)

            VStack(spacing: 0) {
                Spacer()

                if let teaser = flow.teaser {
                    VStack(spacing: 28) {
                        Overline(text: "Your readiness")
                            .enters(0, shown: shown)

                        ScoreRing(score: teaser.readinessScore, type: flow.type, size: 210)
                            .enters(1, shown: shown)

                        VStack(spacing: 10) {
                            Text(verdictLine(for: teaser.readinessScore))
                                .font(.display(26))
                                .foregroundStyle(Theme.ink)
                                .multilineTextAlignment(.center)

                            Text("\(teaser.daysToWedding) days to your big day. Your full breakdown, focus areas and week-by-week plan are ready.")
                                .font(.system(size: 15))
                                .foregroundStyle(Theme.inkSecondary)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: 300)
                        }
                        .enters(2, shown: shown)
                    }
                }

                Spacer()

                VStack(spacing: 12) {
                    PrimaryButton(title: "Unlock my full report", type: flow.type) {
                        flow.stage = .claim
                    }
                    Text("Free · saved to your email")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.inkSecondary)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
                .enters(3, shown: shown)
            }
        }
        .navigationBarBackButtonHidden()
        .sensoryFeedback(.success, trigger: landed)
        .onAppear {
            shown = true
            Task {
                try? await Task.sleep(for: .seconds(1.3))
                landed = true
            }
        }
    }

    private func verdictLine(for score: Int) -> String {
        switch score {
        case ..<45: "Plenty of runway"
        case ..<60: "A strong base to build on"
        case ..<75: "You're closer than you think"
        default: "Nearly photo-shoot ready"
        }
    }
}

/// The signature ring: angular gradient sweep with a gold tip, drawn with a
/// slow spring while the number counts up in step.
struct ScoreRing: View {
    let score: Int
    let type: ClientType
    var size: CGFloat = 180

    @State private var progress = 0.0

    var body: some View {
        ZStack {
            Circle()
                .stroke(Theme.ink.opacity(0.06), lineWidth: size * 0.075)

            Circle()
                .trim(from: 0, to: progress / 100)
                .stroke(
                    Theme.ringGradient(for: type),
                    style: StrokeStyle(lineWidth: size * 0.075, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .shadow(color: Theme.accent(for: type).opacity(0.25), radius: 10)

            VStack(spacing: 0) {
                Text("\(Int(progress))")
                    .font(.score(size * 0.31))
                    .foregroundStyle(Theme.ink)
                    .contentTransition(.numericText(value: progress))
                Text("of 100")
                    .font(.system(size: size * 0.062, weight: .medium))
                    .foregroundStyle(Theme.inkSecondary)
            }
        }
        .frame(width: size, height: size)
        .onAppear {
            withAnimation(.spring(duration: 1.3, bounce: 0.12).delay(0.25)) {
                progress = Double(score)
            }
        }
    }
}
