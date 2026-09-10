import SwiftUI

struct ReportTabsView: View {
    @Environment(ScanFlow.self) private var flow

    var body: some View {
        TabView {
            Tab("Report", systemImage: "chart.bar.doc.horizontal") {
                ReportView()
            }
            Tab("Coach", systemImage: "bubble.left.and.text.bubble.right") {
                CoachView()
            }
        }
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("New scan") { flow.restart() }
            }
        }
    }
}

struct ReportView: View {
    @Environment(ScanFlow.self) private var flow

    private var accent: Color { Theme.accent(for: flow.type) }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                if let report = flow.report {
                    if let groom = report.groomScore {
                        headline(groom, days: report.daysToWedding)
                    }
                    if let scores = report.scores {
                        categoryCard(scores, labels: report.categoryLabels)
                    }
                    if !report.focusAreas.isEmpty {
                        focusCard(report.focusAreas)
                    }
                    if !report.highlights.isEmpty || !report.suggestions.isEmpty {
                        adviceCard(report)
                    }
                    webLink(report)
                } else {
                    ProgressView().padding(.top, 80)
                }
            }
            .padding()
        }
        .background(Theme.paper)
    }

    private func headline(_ groom: GroomScoreBreakdown, days: Int) -> some View {
        VStack(spacing: 12) {
            ScoreRing(score: groom.overall, accent: accent)
                .frame(width: 150, height: 150)
            Text("Readiness score")
                .font(.title3.weight(.medium))
            Text("\(days) days to go")
                .font(.callout)
                .foregroundStyle(.secondary)
            HStack(spacing: 12) {
                pill("Appearance", value: groom.appearance)
                pill("Fitness", value: groom.fitness)
                pill("Confidence", value: groom.confidence)
                pill("Prep", value: groom.prepProgress)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(20)
        .background(.white, in: RoundedRectangle(cornerRadius: 16))
    }

    private func pill(_ label: String, value: Int?) -> some View {
        VStack(spacing: 2) {
            Text(value.map(String.init) ?? "–")
                .font(.headline.monospacedDigit())
                .foregroundStyle(value == nil ? .secondary : .primary)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func categoryCard(_ scores: ScanScores, labels: [String: String]) -> some View {
        card("Breakdown") {
            scoreBar(labels["skin"] ?? "Skin", value: scores.skin)
            scoreBar(labels["hair"] ?? "Hair", value: scores.hair)
            scoreBar(labels["beard"] ?? "Beard", value: scores.beard)
            if let style = scores.style {
                scoreBar(labels["style"] ?? "Style", value: style)
            } else {
                Text("Add a full-body photo next scan to unlock your Style score.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func scoreBar(_ label: String, value: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.subheadline)
                Spacer()
                Text("\(value)").font(.subheadline.monospacedDigit().weight(.semibold))
            }
            ProgressView(value: Double(value), total: 100)
                .tint(accent)
        }
    }

    private func focusCard(_ areas: [FocusArea]) -> some View {
        card("Where to focus") {
            ForEach(areas) { area in
                HStack {
                    Text(area.area.capitalized).font(.subheadline)
                    Spacer()
                    Text("\(area.weight)%")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func adviceCard(_ report: ScanReport) -> some View {
        card("Your coach says") {
            ForEach(report.highlights, id: \.self) { line in
                Label(line, systemImage: "sparkles").font(.subheadline)
            }
            ForEach(report.suggestions, id: \.self) { line in
                Label(line, systemImage: "arrow.forward.circle").font(.subheadline)
            }
        }
    }

    @ViewBuilder
    private func webLink(_ report: ScanReport) -> some View {
        let url = Settings.webBaseURL.appending(path: "/scan/r/\(report.scanId)")
        Link(destination: url) {
            Label("Open my full report on the web", systemImage: "safari")
                .font(.subheadline.weight(.medium))
        }
        .padding(.top, 4)
    }

    private func card(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.headline)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(.white, in: RoundedRectangle(cornerRadius: 16))
    }
}
