import SwiftUI

/// Review the captured set, then upload. Nothing has left the phone before
/// the button on this screen — that's the privacy contract the capture flow
/// promises.
struct ReviewUploadView: View {
    @Environment(ScanFlow.self) private var flow
    @State private var uploading = false
    @State private var errorMessage: String?
    @State private var framingRetakeStep: CaptureStep?

    var body: some View {
        VStack(spacing: 20) {
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                    ForEach(CaptureStep.allCases) { step in
                        photoCell(step)
                    }
                }
                .padding()
            }

            if let errorMessage {
                Text(errorMessage)
                    .font(.callout)
                    .foregroundStyle(Theme.rose)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }

            Button {
                Task { await upload() }
            } label: {
                Group {
                    if uploading {
                        ProgressView().tint(.white)
                    } else {
                        Text("Upload & get my score")
                    }
                }
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent(for: flow.type))
            .disabled(uploading || flow.photos[.front] == nil)
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
        .navigationTitle("Your photos")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Retake all") {
                    flow.photos = [:]
                    flow.currentStep = .front
                    flow.stage = .capture
                }
            }
        }
    }

    @ViewBuilder
    private func photoCell(_ step: CaptureStep) -> some View {
        VStack(spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(.quaternary)
                    .aspectRatio(3 / 4, contentMode: .fit)
                if let data = flow.photos[step], let image = UIImage(data: data) {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(3 / 4, contentMode: .fill)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                } else {
                    VStack(spacing: 4) {
                        Image(systemName: "camera")
                        Text(step.required ? "Required" : "Optional")
                            .font(.caption2)
                    }
                    .foregroundStyle(.secondary)
                }
            }
            Button(flow.photos[step] == nil ? "Add \(step.title.lowercased())" : "Retake") {
                flow.currentStep = step
                flow.stage = .capture
            }
            .font(.caption.weight(.medium))
        }
    }

    private func upload() async {
        uploading = true
        errorMessage = nil
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
            errorMessage = error.message
            flow.currentStep = .front
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// The anonymous teaser — mirrors the web funnel's email gate: score + count-
/// down now, full breakdown after claiming.
struct TeaserView: View {
    @Environment(ScanFlow.self) private var flow

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            if let teaser = flow.teaser {
                ScoreRing(score: teaser.readinessScore, accent: Theme.accent(for: flow.type))
                    .frame(width: 180, height: 180)
                Text("Your readiness score")
                    .font(.title3.weight(.medium))
                Text("\(teaser.daysToWedding) days to your big day. Unlock the full breakdown, your focus areas, and a week-by-week plan.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            Spacer()
            Button {
                flow.stage = .claim
            } label: {
                Text("Unlock my full report")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent(for: flow.type))
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
        .navigationBarBackButtonHidden()
    }
}

struct ScoreRing: View {
    let score: Int
    let accent: Color
    @State private var shown = 0.0

    var body: some View {
        ZStack {
            Circle().stroke(.quaternary, lineWidth: 14)
            Circle()
                .trim(from: 0, to: shown / 100)
                .stroke(accent, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(Int(shown))")
                .font(.system(size: 56, weight: .bold, design: .rounded))
                .contentTransition(.numericText())
        }
        .onAppear {
            withAnimation(.easeOut(duration: 1.2)) { shown = Double(score) }
        }
    }
}
