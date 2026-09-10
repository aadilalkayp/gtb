import Foundation

// MARK: - API payloads (subset of apps/api scan routes the app consumes)

struct ScanTeaser: Decodable {
    let readinessScore: Int
    let daysToWedding: Int
}

struct StartResponse: Decodable {
    let ok: Bool
    let scanId: String?
    let teaser: ScanTeaser?
}

struct ScanScores: Decodable {
    let skin: Int
    let hair: Int
    let beard: Int
    let style: Int?
    let appearance: Int
    let readiness: Int
}

struct GroomScoreBreakdown: Decodable {
    let overall: Int
    let appearance: Int
    let fitness: Int?
    let confidence: Int?
    let prepProgress: Int?
}

struct ScanAttribute: Decodable, Identifiable {
    let key: String
    let label: String
    let score: Int
    var id: String { key }
}

struct FocusArea: Decodable, Identifiable {
    let area: String
    let weight: Int
    var id: String { area }
}

struct ScanReport: Decodable {
    let scanId: String
    let daysToWedding: Int
    let categoryLabels: [String: String]
    let scores: ScanScores?
    let groomScore: GroomScoreBreakdown?
    let attributes: [ScanAttribute]
    let focusAreas: [FocusArea]
    let highlights: [String]
    let suggestions: [String]
}

struct ClaimResponse: Decodable {
    let ok: Bool
    let report: ScanReport
}

struct APIErrorBody: Decodable {
    let error: String
}

struct APIError: LocalizedError {
    let message: String
    /// 422 = the server-side framing gate rejected a photo. With the live
    /// capture coach this should be rare; surface it as "retake", not "error".
    let isFramingRejection: Bool
    var errorDescription: String? { message }
}

// MARK: - Client

/// Thin async client for the public scan funnel routes. Anonymous by design —
/// the funnel runs pre-registration, so no auth is involved.
struct ScanAPI {
    let baseURL: URL

    func startScan(
        photos: [CaptureStep: Data],
        type: ClientType,
        bigDay: Date
    ) async throws -> StartResponse {
        var form = MultipartForm()
        form.addField("type", value: type.rawValue)
        form.addField("weddingDate", value: ISO8601DateFormatter().string(from: bigDay))
        for (step, data) in photos {
            form.addFile(step.field, filename: "\(step.rawValue).jpg", mimeType: "image/jpeg", data: data)
        }
        var request = URLRequest(url: baseURL.appending(path: "/api/scan/start"))
        request.httpMethod = "POST"
        request.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = form.encode()
        request.timeoutInterval = 120 // scoring is synchronous server-side
        return try await send(request)
    }

    func claim(scanId: String, name: String, email: String, phone: String, city: String) async throws -> ClaimResponse {
        var request = URLRequest(url: baseURL.appending(path: "/api/scan/claim"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            ["scanId": scanId, "name": name, "email": email, "phone": phone, "city": city]
        )
        return try await send(request)
    }

    private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let message = (try? JSONDecoder().decode(APIErrorBody.self, from: data))?.error
                ?? "The server had a problem (\(status)). Please try again."
            throw APIError(message: message, isFramingRejection: status == 422)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

// MARK: - Multipart encoding

struct MultipartForm {
    private let boundary = "gtb-scan-\(UUID().uuidString)"
    private var body = Data()

    var contentType: String { "multipart/form-data; boundary=\(boundary)" }

    mutating func addField(_ name: String, value: String) {
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
    }

    mutating func addFile(_ name: String, filename: String, mimeType: String, data: Data) {
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\nContent-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n".utf8))
    }

    func encode() -> Data {
        body + Data("--\(boundary)--\r\n".utf8)
    }
}
