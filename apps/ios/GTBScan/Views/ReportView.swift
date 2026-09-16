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
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Theme.inkSecondary)
            }
        }
    }
}

/// The report as an editorial spread: headline ring, then cards that rise in
/// one after another, bars filling with a stagger.
struct ReportView: View {
    @Environment(ScanFlow.self) private var flow
    @State private var shown = false

    private var accent: Color { Theme.accent(for: flow.type) }

    var body: some View {
        ZStack {
            AtelierBackground(type: flow.type)

            ScrollView {
                VStack(spacing: 18) {
                    if let report = flow.report {
                        if let groom = report.groomScore {
                            headline(groom, days: report.daysToWedding)
                                .enters(0, shown: shown)
                        }
                        if let scores = report.scores {
                            categoryCard(scores, labels: report.categoryLabels)
                                .enters(1, shown: shown)
                        }
                        if !report.focusAreas.isEmpty {
                            focusCard(report.focusAreas)
                                .enters(2, shown: shown)
                        }
                        if !report.highlights.isEmpty || !report.suggestions.isEmpty {
                            adviceCard(report)
                                .enters(3, shown: shown)
                        }
                        webLink(report)
                            .enters(4, shown: shown)
                    } else {
                        ProgressView().padding(.top, 100)
                    }
                }
                .padding(20)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .onAppear { shown = true }
    }

    // MARK: Headline

    private func headline(_ groom: GroomScoreBreakdown, days: Int) -> some View {
        VStack(spacing: 20) {
            Overline(text: "\(days) days to go")
            ScoreRing(score: groom.overall, type: flow.type, size: 170)

            HStack(spacing: 0) {
                inputTile("Appearance", value: groom.appearance, icon: "sparkles")
                tileDivider
                inputTile("Fitness", value: groom.fitness, icon: "figure.run")
                tileDivider
                inputTile("Confidence", value: groom.confidence, icon: "face.smiling")
                tileDivider
                inputTile("Prep", value: groom.prepProgress, icon: "checklist")
            }
        }
        .frame(maxWidth: .infinity)
        .atelierCard()
    }

    private var tileDivider: some View {
        Rectangle().fill(Theme.hairline).frame(width: 1, height: 34)
    }

    private func inputTile(_ label: String, value: Int?, icon: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(value == nil ? Theme.inkSecondary.opacity(0.5) : accent)
            Text(value.map(String.init) ?? "–")
                .font(.score(17))
                .foregroundStyle(value == nil ? Theme.inkSecondary.opacity(0.6) : Theme.ink)
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(Theme.inkSecondary)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Cards

    private func categoryCard(_ scores: ScanScores, labels: [String: String]) -> some View {
        card("The breakdown") {
            VStack(spacing: 16) {
                ScoreBar(label: labels["skin"] ?? "Skin", value: scores.skin, type: flow.type, index: 0, shown: shown)
                ScoreBar(label: labels["hair"] ?? "Hair", value: scores.hair, type: flow.type, index: 1, shown: shown)
                ScoreBar(label: labels["beard"] ?? "Beard", value: scores.beard, type: flow.type, index: 2, shown: shown)
                if let style = scores.style {
                    ScoreBar(label: labels["style"] ?? "Style", value: style, type: flow.type, index: 3, shown: shown)
                } else {
                    Label("Add a full-body photo next scan to unlock Style.", systemImage: "lock.open")
                        .font(.system(size: 12))
                        .foregroundStyle(Theme.inkSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private func focusCard(_ areas: [FocusArea]) -> some View {
        card("Where to focus") {
            VStack(spacing: 12) {
                ForEach(areas) { area in
                    HStack {
                        Text(area.area.capitalized)
                            .font(.system(size: 15))
                            .foregroundStyle(Theme.ink)
                        Spacer()
                        Text("\(area.weight)%")
                            .font(.score(14))
                            .foregroundStyle(accent)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(accent.opacity(0.1), in: Capsule())
                    }
                }
            }
        }
    }

    private func adviceCard(_ report: ScanReport) -> some View {
        card("From your coach") {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(report.highlights, id: \.self) { line in
                    advice(line, icon: "sparkles", color: Theme.gold)
                }
                if !report.highlights.isEmpty, !report.suggestions.isEmpty {
                    Divider().overlay(Theme.hairline)
                }
                ForEach(report.suggestions, id: \.self) { line in
                    advice(line, icon: "arrow.forward", color: accent)
                }
            }
        }
    }

    private func advice(_ text: String, icon: String, color: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(color)
            Text(text)
                .font(.system(size: 14))
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func webLink(_ report: ScanReport) -> some View {
        let url = Settings.webBaseURL.appending(path: "/scan/r/\(report.scanId)")
        Link(destination: url) {
            Label("Open my full report on the web", systemImage: "arrow.up.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(accent)
        }
        .buttonStyle(PressableStyle())
        .padding(.top, 2)
        .padding(.bottom, 8)
    }

    private func card(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Overline(text: title)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .atelierCard()
    }
}

/// One category bar: fills with a stagger after the card lands, gradient
/// matched to the ring.
struct ScoreBar: View {
    let label: String
    let value: Int
    let type: ClientType
    let index: Int
    let shown: Bool

    @State private var filled = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(label)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(Theme.ink)
                Spacer()
                Text("\(value)")
                    .font(.score(15))
                    .foregroundStyle(Theme.ink)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.ink.opacity(0.06))
                    Capsule()
                        .fill(Theme.accentGradient(for: type))
                        .frame(width: filled ? geo.size.width * CGFloat(value) / 100 : 0)
                }
            }
            .frame(height: 8)
        }
        .onChange(of: shown, initial: true) { _, isShown in
            guard isShown else { return }
            withAnimation(Theme.springSlow.delay(0.3 + Double(index) * 0.08)) {
                filled = true
            }
        }
    }
}
