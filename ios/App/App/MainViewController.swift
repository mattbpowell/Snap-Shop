import UIKit
import Capacitor

/// Hosts the Capacitor WKWebView and registers any custom (non-npm) plugins
/// that this app defines locally. Auto-registration in Capacitor 7 reads
/// `packageClassList` in `capacitor.config.json`, which `npx cap sync` only
/// populates from npm plugins — local plugins must be registered explicitly.
/// `registerPluginInstance` is intentional here over `registerPluginType`,
/// because the latter is a no-op when `autoRegisterPlugins` is true (the
/// default).
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(VisionOCRPlugin())
        bridge?.registerPluginInstance(AppleLLMPlugin())
    }
}
