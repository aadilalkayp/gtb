import SwiftUI

/// The funnel's email gate, styled as a note card rather than a stock form.
/// Same fields and dedup semantics as the web claim form.
struct ClaimView: View {
    @Environment(ScanFlow.self) private var flow
    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var city = ""
    @State private var submitting = false
    @State private var errorMessage: String?
    @State private var shown = false
    @FocusState private var focused: Field?

    enum Field { case name, email, phone, city }

    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
            && email.contains("@") && email.contains(".")
            && !phone.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        ZStack {
            AtelierBackground(type: flow.type)

            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 6) {
                        Overline(text: "Almost there")
                        Text("Where should we\nsend your report?")
                            .font(.display(30))
                            .foregroundStyle(Theme.ink)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 12)
                    .enters(0, shown: shown)

                    VStack(spacing: 0) {
                        field("Name", text: $name, focus: .name, content: .name)
                        divider
                        field("Email", text: $email, focus: .email, content: .emailAddress, keyboard: .emailAddress)
                        divider
                        field("Phone", text: $phone, focus: .phone, content: .telephoneNumber, keyboard: .phonePad)
                        divider
                        field("City (optional)", text: $city, focus: .city, content: .addressCity)
                    }
                    .atelierCard(padding: 6)
                    .padding(.horizontal, 24)
                    .enters(1, shown: shown)

                    if let errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(Theme.rose)
                            .padding(.horizontal, 24)
                            .transition(.opacity.combined(with: .offset(y: 6)))
                    }

                    VStack(spacing: 12) {
                        PrimaryButton(title: "See my full report", loading: submitting, type: flow.type) {
                            Task { await claim() }
                        }
                        .disabled(!valid || submitting)
                        .opacity(valid ? 1 : 0.5)
                        .animation(.easeOut(duration: 0.2), value: valid)

                        Text("Your report is saved to your email. A GTB coach may reach out with your plan.")
                            .font(.system(size: 12))
                            .foregroundStyle(Theme.inkSecondary)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: 300)
                    }
                    .padding(.horizontal, 24)
                    .enters(2, shown: shown)
                }
                .padding(.bottom, 24)
            }
            .scrollBounceBehavior(.basedOnSize)
            .animation(Theme.springFast, value: errorMessage)
        }
        .onAppear {
            shown = true
            focused = .name
        }
    }

    private var divider: some View {
        Divider().overlay(Theme.hairline).padding(.leading, 16)
    }

    private func field(
        _ label: String,
        text: Binding<String>,
        focus: Field,
        content: UITextContentType,
        keyboard: UIKeyboardType = .default
    ) -> some View {
        TextField(label, text: text)
            .textContentType(content)
            .keyboardType(keyboard)
            .textInputAutocapitalization(content == .emailAddress ? .never : .words)
            .autocorrectionDisabled(content == .emailAddress)
            .focused($focused, equals: focus)
            .font(.system(size: 16))
            .padding(.horizontal, 16)
            .frame(height: 52)
            .submitLabel(focus == .city ? .done : .next)
            .onSubmit {
                switch focus {
                case .name: focused = .email
                case .email: focused = .phone
                case .phone: focused = .city
                case .city: focused = nil
                }
            }
    }

    private func claim() async {
        guard let scanId = flow.scanId else { return }
        submitting = true
        withAnimation(Theme.springFast) { errorMessage = nil }
        defer { submitting = false }
        do {
            let response = try await flow.api.claim(
                scanId: scanId,
                name: name.trimmingCharacters(in: .whitespaces),
                email: email.trimmingCharacters(in: .whitespaces).lowercased(),
                phone: phone.trimmingCharacters(in: .whitespaces),
                city: city.trimmingCharacters(in: .whitespaces)
            )
            flow.report = response.report
            flow.stage = .report
        } catch {
            withAnimation(Theme.springFast) { errorMessage = error.localizedDescription }
        }
    }
}
