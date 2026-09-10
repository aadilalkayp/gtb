import SwiftUI

struct SetupView: View {
    @Environment(ScanFlow.self) private var flow
    @State private var showSettings = false
    @State private var shown = false

    var body: some View {
        @Bindable var flow = flow
        ZStack {
            AtelierBackground(type: flow.type)
                .animation(.easeInOut(duration: 0.6), value: flow.type)

            VStack(spacing: 0) {
                Spacer(minLength: 0)

                VStack(spacing: 18) {
                    Overline(text: "Groom to be · Glow to be")
                        .enters(0, shown: shown)

                    Text("The Readiness\nScan")
                        .font(.display(46))
                        .foregroundStyle(Theme.ink)
                        .multilineTextAlignment(.center)
                        .lineSpacing(2)
                        .enters(1, shown: shown)

                    Text("Three minutes, a few photos, and a plan for your big day.")
                        .font(.system(size: 16))
                        .foregroundStyle(Theme.inkSecondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 300)
                        .enters(2, shown: shown)
                }

                Spacer(minLength: 28)

                VStack(spacing: 0) {
                    TypeToggle(selection: $flow.type)
                        .padding(.bottom, 18)

                    Divider().overlay(Theme.hairline)

                    HStack {
                        Label {
                            Text("My big day")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(Theme.ink)
                        } icon: {
                            Image(systemName: "calendar")
                                .foregroundStyle(Theme.accent(for: flow.type))
                        }
                        Spacer()
                        DatePicker(
                            "", selection: $flow.bigDay,
                            in: Date.now...,
                            displayedComponents: .date
                        )
                        .labelsHidden()
                    }
                    .padding(.top, 14)
                }
                .atelierCard()
                .padding(.horizontal, 24)
                .enters(3, shown: shown)

                Spacer(minLength: 28)

                VStack(spacing: 14) {
                    PrimaryButton(title: "Begin my scan", type: flow.type) {
                        flow.currentStep = .front
                        flow.stage = .capture
                    }

                    Label {
                        Text("Framing is checked on this phone. Nothing uploads until you say so.")
                    } icon: {
                        Image(systemName: "lock.fill")
                            .font(.system(size: 10))
                    }
                    .font(.system(size: 12))
                    .foregroundStyle(Theme.inkSecondary)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
                .enters(4, shown: shown)
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showSettings = true } label: {
                    Image(systemName: "gearshape")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(Theme.inkSecondary)
                }
            }
        }
        .sheet(isPresented: $showSettings) {
            EndpointSettingsView()
                .presentationDetents([.medium])
        }
        .onAppear { shown = true }
    }
}

/// Groom/bride switch: a sliding pill (matched geometry), not a stock
/// segmented control — the choice deserves the app's own voice.
struct TypeToggle: View {
    @Binding var selection: ClientType
    @Namespace private var pill

    var body: some View {
        HStack(spacing: 4) {
            ForEach(ClientType.allCases) { type in
                Button {
                    withAnimation(Theme.springFast) { selection = type }
                } label: {
                    Text(type.label)
                        .font(.system(size: 15, weight: selection == type ? .semibold : .medium))
                        .foregroundStyle(selection == type ? .white : Theme.inkSecondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 42)
                        .background {
                            if selection == type {
                                Capsule()
                                    .fill(Theme.accentGradient(for: type))
                                    .matchedGeometryEffect(id: "pill", in: pill)
                            }
                        }
                }
                .buttonStyle(PressableStyle())
            }
        }
        .padding(4)
        .background(Capsule().fill(Theme.paper))
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// Where the app points. Defaults are local dev; set the deployed URLs here
/// for a device build.
struct EndpointSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("apiBaseURL") private var apiBaseURL = Settings.defaultAPI.absoluteString
    @AppStorage("webBaseURL") private var webBaseURL = Settings.defaultWeb.absoluteString

    var body: some View {
        NavigationStack {
            Form {
                Section("API server") {
                    TextField("https://api.example.com", text: $apiBaseURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Section("Web app (report links)") {
                    TextField("https://example.com", text: $webBaseURL)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .navigationTitle("Endpoints")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
