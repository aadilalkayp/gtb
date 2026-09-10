import SwiftUI

/// The funnel's email gate: same fields, same dedup semantics as the web
/// claim form (the server matches email against existing clients).
struct ClaimView: View {
    @Environment(ScanFlow.self) private var flow
    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var city = ""
    @State private var submitting = false
    @State private var errorMessage: String?

    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
            && email.contains("@") && email.contains(".")
            && !phone.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        Form {
            Section {
                TextField("Name", text: $name)
                    .textContentType(.name)
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                TextField("Phone", text: $phone)
                    .textContentType(.telephoneNumber)
                    .keyboardType(.phonePad)
                TextField("City (optional)", text: $city)
                    .textContentType(.addressCity)
            } footer: {
                Text("Your report is saved to your email. A GTB coach may reach out with your plan.")
            }

            if let errorMessage {
                Text(errorMessage).foregroundStyle(Theme.rose)
            }

            Button {
                Task { await claim() }
            } label: {
                Group {
                    if submitting {
                        ProgressView()
                    } else {
                        Text("See my full report")
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .disabled(!valid || submitting)
        }
        .navigationTitle("Unlock report")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func claim() async {
        guard let scanId = flow.scanId else { return }
        submitting = true
        errorMessage = nil
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
            errorMessage = error.localizedDescription
        }
    }
}
