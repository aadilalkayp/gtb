import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Tier-1 coach on Apple's on-device foundation model (iOS 26+): instant,
/// free, offline, and nothing typed here leaves the phone. Mirrors the server
/// coach's scope rules and knowledge; anything deeper (live checklist, human
/// follow-up) belongs to the tier-2 server coach on the web report page,
/// which the UI hands off to.
@MainActor
@Observable
final class LocalCoach {
    enum Availability: Equatable {
        case checking
        case ready
        case unavailable(String)
    }

    struct Turn: Identifiable, Equatable {
        let id = UUID()
        let role: Role
        var text: String
        enum Role { case user, coach }
    }

    var availability: Availability = .checking
    var turns: [Turn] = []
    var thinking = false

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private var session: LanguageModelSession? {
        get { _session as? LanguageModelSession }
        set { _session = newValue }
    }
    private var _session: Any?
    #endif

    func prepare(report: ScanReport?, type: ClientType) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                session = LanguageModelSession(
                    instructions: Self.instructions(report: report, type: type)
                )
                availability = .ready
            case .unavailable(let reason):
                availability = .unavailable(Self.describe(reason))
            }
            return
        }
        #endif
        availability = .unavailable(
            "The on-device coach needs iOS 26 with Apple Intelligence. Your full AI coach is on your web report page."
        )
    }

    func ask(_ question: String) async {
        let trimmed = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !thinking else { return }
        turns.append(Turn(role: .user, text: trimmed))
        thinking = true
        defer { thinking = false }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), let session {
            do {
                let response = try await session.respond(to: trimmed)
                turns.append(Turn(role: .coach, text: response.content))
            } catch {
                turns.append(Turn(
                    role: .coach,
                    text: "I hit a snag on this device. Try again, or ask the full coach on your web report page."
                ))
            }
            return
        }
        #endif
    }

    // MARK: Prompt

    private static func instructions(report: ScanReport?, type: ClientType) -> String {
        var context = "No scan details are available yet."
        if let report {
            let labels = report.categoryLabels
            let scores = report.scores
            context = """
            This person is a \(type == .bride ? "woman" : "man") with their big day in \(report.daysToWedding) days.
            Latest scan (0-100): \(labels["skin"] ?? "Skin") \(scores?.skin.description ?? "-"), \(labels["hair"] ?? "Hair") \(scores?.hair.description ?? "-"), \(labels["beard"] ?? "Beard") \(scores?.beard.description ?? "-").
            Focus areas: \(report.focusAreas.map { "\($0.area) (\($0.weight)%)" }.joined(separator: ", ")).
            """
        }
        return """
        You are the GTB Coach, the assistant of GTB (Groom To Be / Glow To Be), a grooming and transformation studio that gets people ready for their big day. Warm, direct, experienced groomer's voice: short paragraphs, concrete steps, no fluff.

        SCOPE: only skincare routines, hair and beard or brow grooming, outfit and colour guidance, fitness habits, and big-day preparation timing. Anything else is outside what you can help with; say so and steer back.

        HARD RULES:
        - Never give medical advice, name a diagnosis, or recommend medication. Suggest a dermatologist or doctor instead.
        - Never quote prices or book anything; a GTB coach follows up on those (via the web report page).
        - Keep answers under 150 words. Plain natural sentences, never an em dash.

        THIS PERSON:
        \(context)

        GTB KNOWLEDGE:
        \(knowledgeSnapshot)
        """
    }

    /// Offline snapshot of the coach KB's core guidance. The server coach
    /// retrieves live articles; this tier answers instantly from the basics.
    private static let knowledgeSnapshot = """
    Daily skin routine: gentle cleanser then moisturizer, morning and night; sunscreen every morning even indoors. Give any new routine three weeks. Nothing new in the last two weeks before the big day.
    Beard: neckline two fingers above the Adam's apple, cheek line natural. Trim weekly, never the night before an event; a fresh trim needs two or three days to settle.
    Brows: tidy weekly, follow the natural shape, never over-thin.
    Colours: deep saturated colours near the face photograph best. If a shade washes you out in daylight it will look worse under flash. Test outfits in the venue's kind of light.
    Countdown: final haircut ten days out, final beard shape three days out, outfit fitting locked two weeks out.
    Basics that show on skin: seven to eight hours of sleep and around three litres of water daily.
    """

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private static func describe(_ reason: SystemLanguageModel.Availability.UnavailableReason) -> String {
        switch reason {
        case .deviceNotEligible:
            "This device can't run Apple's on-device model. Your full AI coach is on your web report page."
        case .appleIntelligenceNotEnabled:
            "Turn on Apple Intelligence in Settings to chat here, or use the full coach on your web report page."
        case .modelNotReady:
            "The on-device model is still downloading. Try again in a bit, or use the coach on your web report page."
        @unknown default:
            "The on-device coach isn't available right now. Your full AI coach is on your web report page."
        }
    }
    #endif
}
