// ===========================================================================
// AnchorWidget.swift — a WidgetKit home-screen widget for Anchor.
//
// Shows the user's streak, energy (vitality) and current level at a glance.
// Reads a small JSON snapshot the app writes into a SHARED App Group container.
//
// SETUP (manual, in Xcode — see README-WIDGET.md):
//   1. File ▸ New ▸ Target ▸ Widget Extension  →  name it "AnchorWidget".
//   2. Add BOTH the app target and the widget target to an App Group
//      (Signing & Capabilities ▸ App Groups ▸ "group.com.flowstate.anchor").
//   3. Replace the generated widget file with this one.
//   4. Have the app write the snapshot to the App Group (a ~12-line Capacitor
//      plugin, sketched in README-WIDGET.md, listens for AnchorWidget.publish).
// ===========================================================================
import WidgetKit
import SwiftUI

private let APP_GROUP = "group.com.flowstate.anchor"
private let SNAPSHOT_KEY = "anchor_widget"

struct AnchorSnapshot: Codable {
    var name: String = "friend"
    var streak: Int = 0
    var vitality: Int = 0
    var vitalityBand: String = "steady"
    var level: Int = 1
    var levelName: String = "First light"
    var weather: String = "cloud"
}

func loadSnapshot() -> AnchorSnapshot {
    guard
        let defaults = UserDefaults(suiteName: APP_GROUP),
        let raw = defaults.string(forKey: SNAPSHOT_KEY),
        let data = raw.data(using: .utf8),
        let snap = try? JSONDecoder().decode(AnchorSnapshot.self, from: data)
    else { return AnchorSnapshot() }
    return snap
}

struct AnchorEntry: TimelineEntry {
    let date: Date
    let snap: AnchorSnapshot
}

struct AnchorProvider: TimelineProvider {
    func placeholder(in context: Context) -> AnchorEntry {
        AnchorEntry(date: Date(), snap: AnchorSnapshot())
    }
    func getSnapshot(in context: Context, completion: @escaping (AnchorEntry) -> Void) {
        completion(AnchorEntry(date: Date(), snap: loadSnapshot()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<AnchorEntry>) -> Void) {
        let entry = AnchorEntry(date: Date(), snap: loadSnapshot())
        // refresh ~hourly; the app also nudges WidgetCenter on data changes
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

private func weatherEmoji(_ code: String) -> String {
    switch code {
    case "sun": return "☀️"; case "clear": return "🌤️"; case "rain": return "🌧️"
    case "storm": return "⛈️"; case "fog": return "🌫️"; default: return "☁️"
    }
}

struct AnchorWidgetView: View {
    var entry: AnchorEntry
    var body: some View {
        let s = entry.snap
        ZStack {
            LinearGradient(colors: [Color(red: 0.06, green: 0.07, blue: 0.13),
                                    Color(red: 0.10, green: 0.09, blue: 0.20)],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Anchor").font(.caption2).bold().foregroundColor(.white.opacity(0.6))
                    Spacer()
                    Text(weatherEmoji(s.weather))
                }
                Spacer()
                Text("\(s.vitality)")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .foregroundColor(.white)
                Text("energy").font(.caption2).foregroundColor(.white.opacity(0.6))
                ProgressView(value: Double(s.vitality), total: 100)
                    .tint(.cyan)
                HStack {
                    Label("\(s.streak)", systemImage: "flame.fill").font(.caption2).foregroundColor(.orange)
                    Spacer()
                    Text("Lv \(s.level)").font(.caption2).foregroundColor(.white.opacity(0.7))
                }
            }
            .padding(14)
        }
    }
}

@main
struct AnchorWidget: Widget {
    let kind = "AnchorWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: AnchorProvider()) { entry in
            AnchorWidgetView(entry: entry)
        }
        .configurationDisplayName("Anchor")
        .description("Your streak, energy and level at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
