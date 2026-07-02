import UIKit
import Capacitor

/// UIScene lifecycle adoption.
///
/// iOS 27 (when built with the iOS 27 SDK) hard-asserts at launch if an app
/// still uses the legacy AppDelegate-only lifecycle — the crash surfaces as
/// EXC_BREAKPOINT in UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption.
/// Capacitor 7's template predates this, so we adopt scenes ourselves:
/// Info.plist's UIApplicationSceneManifest points at this class and at
/// Main.storyboard, and UIKit instantiates the window + CAPBridgeViewController
/// (our MainViewController) from the storyboard automatically.
///
/// URL opens and universal links are forwarded to Capacitor's
/// ApplicationDelegateProxy, mirroring what the legacy AppDelegate callbacks
/// did (those callbacks stop firing once scenes are adopted).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        // Storyboard-based setup: UIKit has already created the window and
        // root view controller from Main.storyboard. Handle any URL/activity
        // the app was cold-launched with.
        if let urlContext = connectionOptions.urlContexts.first {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                open: urlContext.url,
                options: [:]
            )
        }
        if let activity = connectionOptions.userActivities.first {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                continue: activity,
                restorationHandler: { _ in }
            )
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            open: url,
            options: [:]
        )
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }
}
