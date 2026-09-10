import SwiftUI

/// The Atelier design language, translated to iOS.
///
/// One idea holds the app together: an editorial, print-like calm (warm
/// paper, serif display, generous space) for every screen EXCEPT capture,
/// which goes full dark camera chrome — the same contrast a photo studio
/// has between its lounge and its shooting floor.
enum Theme {
    // Palette
    static let paper = Color(red: 0.972, green: 0.961, blue: 0.941)
    static let ink = Color(red: 0.11, green: 0.10, blue: 0.09)
    static let inkSecondary = Color(red: 0.42, green: 0.40, blue: 0.37)
    static let hairline = Color.black.opacity(0.07)

    static let teal = Color(red: 0.043, green: 0.42, blue: 0.39)
    static let tealDeep = Color(red: 0.01, green: 0.27, blue: 0.26)
    static let rose = Color(red: 0.72, green: 0.29, blue: 0.38)
    static let roseDeep = Color(red: 0.52, green: 0.16, blue: 0.26)
    static let gold = Color(red: 0.78, green: 0.60, blue: 0.31)

    static func accent(for type: ClientType) -> Color {
        type == .bride ? rose : teal
    }

    static func accentGradient(for type: ClientType) -> LinearGradient {
        LinearGradient(
            colors: type == .bride ? [rose, roseDeep] : [teal, tealDeep],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    /// The score ring's sweep: quiet start, gold flourish at the tip.
    static func ringGradient(for type: ClientType) -> AngularGradient {
        AngularGradient(
            colors: type == .bride
                ? [rose.opacity(0.25), rose, roseDeep, gold]
                : [teal.opacity(0.25), teal, tealDeep, gold],
            center: .center,
            startAngle: .degrees(-90),
            endAngle: .degrees(270)
        )
    }

    // Motion: one spring family so the whole app moves with one voice.
    static let spring = Animation.spring(duration: 0.45, bounce: 0.18)
    static let springFast = Animation.spring(duration: 0.28, bounce: 0.12)
    static let springSlow = Animation.spring(duration: 0.7, bounce: 0.14)
}

// MARK: - Typography

extension Font {
    /// Editorial display — New York, the app's voice for big statements.
    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .semibold, design: .serif)
    }
    /// Letter-spaced caps for overlines; use with `.kerning(1.6)`.
    static let overline = Font.system(size: 11, weight: .semibold)
    /// Numbers that move — rounded, monospaced digits.
    static func score(_ size: CGFloat) -> Font {
        .system(size: size, weight: .bold, design: .rounded)
    }
}

// MARK: - Buttons

/// Every pressable surface answers the finger: 0.97 scale, fast spring.
struct PressableStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(.spring(duration: 0.2, bounce: 0), value: configuration.isPressed)
    }
}

/// The app's one primary action per screen: full-width gradient capsule.
struct PrimaryButton: View {
    let title: String
    var loading = false
    let type: ClientType
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Capsule()
                    .fill(Theme.accentGradient(for: type))
                    .shadow(color: Theme.accent(for: type).opacity(0.35), radius: 16, y: 8)
                Group {
                    if loading {
                        ProgressView().tint(.white)
                    } else {
                        Text(title)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                }
                .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
            .frame(height: 56)
            .animation(Theme.springFast, value: loading)
        }
        .buttonStyle(PressableStyle())
    }
}

// MARK: - Surfaces

extension View {
    /// The standard raised card: soft white, continuous corners, quiet shadow.
    func atelierCard(padding: CGFloat = 20) -> some View {
        self
            .padding(padding)
            .background {
                RoundedRectangle(cornerRadius: 24, style: .continuous)
                    .fill(.white)
                    .shadow(color: .black.opacity(0.05), radius: 20, y: 10)
                    .overlay {
                        RoundedRectangle(cornerRadius: 24, style: .continuous)
                            .strokeBorder(Theme.hairline, lineWidth: 1)
                    }
            }
    }

    /// Staggered editorial entrance: rise 12pt + fade, one spring, per-index delay.
    func enters(_ index: Int, shown: Bool) -> some View {
        self
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 12)
            .animation(Theme.spring.delay(Double(index) * 0.06), value: shown)
    }
}

/// Letter-spaced caps overline, the print signature.
struct Overline: View {
    let text: String
    var color: Color = Theme.inkSecondary

    var body: some View {
        Text(text.uppercased())
            .font(.overline)
            .kerning(1.6)
            .foregroundStyle(color)
    }
}

/// Warm paper with two barely-there tinted glows — depth without noise.
struct AtelierBackground: View {
    let type: ClientType

    var body: some View {
        ZStack {
            Theme.paper
            Circle()
                .fill(Theme.accent(for: type).opacity(0.10))
                .frame(width: 420)
                .blur(radius: 80)
                .offset(x: 170, y: -330)
            Circle()
                .fill(Theme.gold.opacity(0.10))
                .frame(width: 360)
                .blur(radius: 90)
                .offset(x: -170, y: 380)
        }
        .ignoresSafeArea()
    }
}
