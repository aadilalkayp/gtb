import SwiftUI

struct SetupView: View {
    @Environment(ScanFlow.self) private var flow
    @State private var showSettings = false

    var body: some View {
        @Bindable var flow = flow
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 8) {
                Text("Transformation\nReadiness Scan")
                    .font(.system(.largeTitle, design: .serif).weight(.semibold))
                    .multilineTextAlignment(.center)
                Text("Three minutes, a few photos, and a plan for your big day. Framing is checked on this phone before anything is uploaded.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }

            VStack(spacing: 16) {
                Picker("I am a", selection: $flow.type) {
                    ForEach(ClientType.allCases) { type in
                        Text(type.label).tag(type)
                    }
                }
                .pickerStyle(.segmented)

                DatePicker(
                    "My big day",
                    selection: $flow.bigDay,
                    in: Date.now...,
                    displayedComponents: .date
                )
                .font(.headline)
            }
            .padding(20)
            .background(.white, in: RoundedRectangle(cornerRadius: 16))
            .padding(.horizontal)

            Button {
                flow.currentStep = .front
                flow.stage = .capture
            } label: {
                Text("Start my scan")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.accent(for: flow.type))
            .padding(.horizontal)

            Spacer()
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showSettings = true } label: { Image(systemName: "gearshape") }
            }
        }
        .sheet(isPresented: $showSettings) { EndpointSettingsView() }
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
