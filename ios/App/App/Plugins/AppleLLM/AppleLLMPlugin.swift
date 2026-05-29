import Capacitor

#if canImport(FoundationModels)
import FoundationModels

// MARK: - Guided-generation types (iOS 26+)
//
// @Generable + @Guide make the model fill a typed Swift value via constrained
// decoding. The structure is GUARANTEED valid — `section` literally cannot be
// outside the enum, the items array is always well-formed — so the JS side
// never has to parse loose JSON or repair malformed model output. We serialize
// the typed value to JSON once for the Capacitor bridge; JS receives a clean,
// stable contract every time.

@available(iOS 26.0, *)
@Generable
enum GrocerySection {
    case produce
    case meatSeafood
    case dairyEggs
    case bakery
    case frozen
    case pantry
    case beverages
    case snacks
    case household
    case other
}

@available(iOS 26.0, *)
extension GrocerySection {
    /// Maps each case to the exact category string the JS app uses
    /// (see src/utils/categories.js).
    var displayName: String {
        switch self {
        case .produce: return "Produce"
        case .meatSeafood: return "Meat & Seafood"
        case .dairyEggs: return "Dairy & Eggs"
        case .bakery: return "Bakery"
        case .frozen: return "Frozen"
        case .pantry: return "Pantry & Dry Goods"
        case .beverages: return "Beverages"
        case .snacks: return "Snacks"
        case .household: return "Household"
        case .other: return "Other"
        }
    }
}

@available(iOS 26.0, *)
@Generable
struct ParsedGroceryItem {
    @Guide(description: "The cleaned, spell-corrected product name in Title Case. Stay close to what the user wrote — fix only obvious OCR or spelling errors, never substitute a different item.")
    let name: String

    @Guide(description: "The grocery store section where this item is typically found.")
    let section: GrocerySection

    @Guide(description: "If this item is an INGREDIENT needed to make one or more dishes or meals the user named, list those dish names here. Leave this empty for items the user listed directly (e.g. 'milk', 'eggs').")
    let forDishes: [String]
}

@available(iOS 26.0, *)
@Generable
struct ParsedGroceryList {
    @Guide(description: "Every shopping item, in the order they should appear on the list.")
    let items: [ParsedGroceryItem]
}

@available(iOS 26.0, *)
@Generable
struct ItemSuggestions {
    @Guide(description: "Between 5 and 8 specific, shoppable items — concrete products found on a store shelf, never categories or prepared dishes.")
    let suggestions: [String]
}
#endif

/// Capacitor wrapper around iOS 26+ Foundation Models with guided generation.
///
/// Methods:
///   - isAvailable()        → { available: Bool, reason: String }
///   - parseGroceryList(...) → { items: [{ name, section, forDishes }] }
///   - suggestItems(...)     → { suggestions: [String] }
///
/// All generation uses @Generable typed output, so the model can't return
/// malformed structure. On iOS < 26 or non-eligible hardware, isAvailable
/// reports the reason and the generate methods reject.
@objc(AppleLLMPlugin)
public class AppleLLMPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleLLMPlugin"
    public let jsName = "AppleLLM"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "parseGroceryList", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "suggestItems", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
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

    @objc func parseGroceryList(_ call: CAPPluginCall) {
        guard let prompt = call.getString("prompt"), !prompt.isEmpty else {
            call.reject("Missing 'prompt'")
            return
        }
        let instructions = call.getString("instructions") ?? ""

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            Task {
                do {
                    let session = instructions.isEmpty
                        ? LanguageModelSession()
                        : LanguageModelSession(instructions: { instructions })
                    let response = try await session.respond(
                        to: prompt,
                        generating: ParsedGroceryList.self
                    )
                    let items: [[String: Any]] = response.content.items.map { item in
                        [
                            "name": item.name,
                            "section": item.section.displayName,
                            "forDishes": item.forDishes,
                        ]
                    }
                    call.resolve(["items": items])
                } catch {
                    call.reject("Foundation Models error: \(error.localizedDescription)")
                }
            }
            return
        }
        #endif
        call.reject("FoundationModels requires iOS 26+")
    }

    @objc func suggestItems(_ call: CAPPluginCall) {
        guard let prompt = call.getString("prompt"), !prompt.isEmpty else {
            call.reject("Missing 'prompt'")
            return
        }
        let instructions = call.getString("instructions") ?? ""

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            Task {
                do {
                    let session = instructions.isEmpty
                        ? LanguageModelSession()
                        : LanguageModelSession(instructions: { instructions })
                    let response = try await session.respond(
                        to: prompt,
                        generating: ItemSuggestions.self
                    )
                    call.resolve(["suggestions": response.content.suggestions])
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
