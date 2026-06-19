# Anchor iOS Home-Screen Widget

A WidgetKit widget that shows the user's **streak, energy (vitality) and level**
on the iOS home screen. The web app already publishes a snapshot for it — these
are the remaining **native** steps (they must be done once, by hand, in Xcode,
because adding an app-extension target and an App Group can't be scripted).

## 1. Add the Widget Extension target
In Xcode: **File ▸ New ▸ Target… ▸ Widget Extension**, name it `AnchorWidget`
(uncheck "Include Configuration Intent"). Replace the generated Swift file with
[`AnchorWidget.swift`](./AnchorWidget.swift) in this folder.

## 2. Share data via an App Group
The web view's `localStorage` is sandboxed and the widget can't read it directly,
so the app must copy a small snapshot into a **shared App Group container**.

- Select the **App** target ▸ Signing & Capabilities ▸ **+ App Groups** ▸ add
  `group.com.flowstate.anchor`.
- Do the same for the **AnchorWidget** target (same group id).

## 3. Bridge the snapshot from JS → App Group
The JS already calls `Capacitor.Plugins.AnchorWidget.publish(snap)` (and writes
`localStorage["anchor_widget"]`). Add a tiny Capacitor plugin so that call lands
in the App Group + refreshes the widget:

```swift
// ios/App/App/AnchorWidgetPlugin.swift
import Capacitor
import WidgetKit

@objc(AnchorWidgetPlugin)
public class AnchorWidgetPlugin: CAPPlugin {
    @objc func publish(_ call: CAPPluginCall) {
        if let obj = call.options as? [String: Any],
           let data = try? JSONSerialization.data(withJSONObject: obj),
           let json = String(data: data, encoding: .utf8) {
            UserDefaults(suiteName: "group.com.flowstate.anchor")?
                .set(json, forKey: "anchor_widget")
            if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        }
        call.resolve()
    }
}
```
…and register it (Capacitor 6/7 auto-discovers `CAPPlugin` subclasses; if not,
add an `.m` bridge or register in `AppDelegate`). No JS changes are needed — the
app calls `AnchorWidget.publish` whenever data changes, and falls back to plain
`localStorage` when the plugin isn't present (e.g. on the web build).

## 4. Build & run
Run the app once (so the snapshot is written), then long-press the home screen ▸
**+ ▸ Anchor** to add the widget. It refreshes hourly and immediately on changes.

> The snapshot shape (see `app.js` → `publishWidget()`):
> `{ name, streak, vitality, vitalityBand, level, levelName, weather, updated }`
