import Capacitor

#if canImport(FoundationModels)
import FoundationModels
#endif

/// Thin Capacitor wrapper around iOS 26+ Foundation Models.
///
/// Two methods:
///   - `isAvailable()`  → `{ available: Bool, reason: String }`
///   - `generate({ prompt, instructions? })` → `{ text: String }`
///
/// On iOS < 26 (or any build without the FoundationModels framework),
/// `isAvailable` reports unavailable and `generate` rejects. On the
/// iPhone Simulator, `SystemLanguageModel.default.availability` typically
/// returns `.unavailable(.deviceNotEligible)` — Apple Intelligence is
/// gated to physical hardware.
@objc(AppleLLMPlugin)
public class AppleLLMPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleLLMPlugin"
    public let jsName = "AppleLLM"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generate", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let availability = SystemLanguageModel.default.availability
            switch availability {
            case .available:
                call.resolve(["available": true, "reason": "available"])
            case .unavailable(let reason):
                call.resolve(["available": false, "reason": String(describing: reason)])
            @unknown default:
                call.resolve(["available": false, "reason": "unknown"])
            }
            return
        }
        #endif
        call.resolve(["available": false, "reason": "FoundationModels requires iOS 26+"])
    }

    @objc func generate(_ call: CAPPluginCall) {
        guard let prompt = call.getString("prompt"), !prompt.isEmpty else {
            call.reject("Missing 'prompt'")
            return
        }
        let instructions = call.getString("instructions") ?? ""

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            Task {
                do {
                    let session: LanguageModelSession
                    if instructions.isEmpty {
                        session = LanguageModelSession()
                    } else {
                        session = LanguageModelSession(instructions: { instructions })
                    }
                    let response = try await session.respond(to: prompt)
                    call.resolve(["text": response.content])
                } catch {
                    call.reject("Foundation Models error: \(error.localizedDescription)")
                }
            }
            return
        }
        #endif
        call.reject("FoundationModels requires iOS 26+")
    }
}
