import Capacitor
import UIKit
import ImageIO

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

// Lightweight item for OCR cleanup — no forDishes (a photographed list has no
// dishes to expand). Fewer fields per element means the small on-device model
// can reliably enumerate a long list (15+ items) without truncating or
// collapsing to a salient few.
@available(iOS 26.0, *)
@Generable
struct CleanedItem {
    @Guide(description: "The cleaned, spell-corrected product name in Title Case. Stay close to what was written — fix only obvious OCR or spelling errors, never substitute a different item.")
    let name: String

    @Guide(description: "The grocery store section where this item is typically found.")
    let section: GrocerySection

    @Guide(description: "True when the shopper should double-check this entry: the writing was ambiguous, it is personal shorthand (e.g. a name possessive like \"Tabby's decaf\"), the product has meaningfully different variants to choose between, or you corrected it with low confidence. False for clearly readable, unambiguous items.")
    let needsClarification: Bool
}

@available(iOS 26.0, *)
@Generable
struct CleanedItemList {
    @Guide(description: "One entry for every recognized line that is a real shopping item, in the original order.")
    let items: [CleanedItem]
}

// Richer item for free-form typed input, where dishes expand into ingredients.
@available(iOS 26.0, *)
@Generable
struct ParsedGroceryItem {
    @Guide(description: "The cleaned, spell-corrected product name in Title Case. Stay close to what the user wrote — fix only obvious OCR or spelling errors, never substitute a different item.")
    let name: String

    @Guide(description: "The grocery store section where this item is typically found.")
    let section: GrocerySection

    @Guide(description: "If this item is an INGREDIENT needed to make one or more dishes or meals the user named, list those dish names here. Leave this empty for items the user listed directly (e.g. 'milk', 'eggs').")
    let forDishes: [String]

    @Guide(description: "True when the shopper should double-check this entry: the writing was ambiguous, it is personal shorthand (e.g. a name possessive like \"Tabby's decaf\"), the product has meaningfully different variants to choose between, or you corrected it with low confidence. False for clearly readable, unambiguous items and for ingredients you generated for a dish.")
    let needsClarification: Bool
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
        CAPPluginMethod(name: "cleanGroceryList", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "parseImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "parseGroceryList", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "suggestItems", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            // `supportsImage` is true on iOS 27+, where Foundation Models
            // accepts an image attachment directly — letting us hand the
            // model the photo instead of OCR'ing to text first.
            var supportsImage = false
            if #available(iOS 27.0, *) { supportsImage = true }
            switch SystemLanguageModel.default.availability {
            case .available:
                call.resolve(["available": true, "reason": "available", "supportsImage": supportsImage])
            case .unavailable(let reason):
                call.resolve(["available": false, "reason": String(describing: reason), "supportsImage": false])
            @unknown default:
                call.resolve(["available": false, "reason": "unknown", "supportsImage": false])
            }
            return
        }
        #endif
        call.resolve(["available": false, "reason": "FoundationModels requires iOS 26+", "supportsImage": false])
    }

    /// iOS 27+: hand the photo to the on-device model directly (no OCR step).
    /// The model sees layout/color/handwriting, so it natively distinguishes
    /// printed template furniture (planner margin tabs) from written items —
    /// the thing the text-only path could never do.
    ///
    /// Uses the rich ParsedGroceryItem type (with forDishes) so a photographed
    /// MEAL PLAN behaves exactly like a typed one: dish names are detected and
    /// expanded into ingredients, each tagged with the dish it belongs to.
    /// Literal items come through with forDishes empty.
    /// Decode + downsample in one step via ImageIO. Camera photos arrive at
    /// 24 MP (5712×4284); decoding that to a full bitmap (~98 MB) and handing
    /// it to the vision encoder on top of model load got the app jetsammed
    /// (signal 9) on device. Thumbnailing never materializes the full bitmap
    /// and bakes in EXIF orientation. ~1600 px long edge is plenty for the
    /// image encoder.
    private static func downsampledImage(from data: Data, maxPixel: Int) -> CGImage? {
        let srcOpts: [CFString: Any] = [kCGImageSourceShouldCache: false]
        guard let src = CGImageSourceCreateWithData(data as CFData, srcOpts as CFDictionary) else {
            return nil
        }
        let thumbOpts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ]
        return CGImageSourceCreateThumbnailAtIndex(src, 0, thumbOpts as CFDictionary)
    }

    /// Free memory visible to this process, in MB — for chasing jetsam kills.
    private static func availableMemoryMB() -> Int {
        Int(os_proc_available_memory() / (1024 * 1024))
    }

    @objc func parseImage(_ call: CAPPluginCall) {
        print("⚡️ [AppleLLM] parseImage enter: availMem=\(Self.availableMemoryMB())MB")
        guard let base64 = call.getString("imageBase64"),
              let data = Data(base64Encoded: base64),
              let cgImage = Self.downsampledImage(from: data, maxPixel: 1024) else {
            call.reject("Invalid image data")
            return
        }
        print("⚡️ [AppleLLM] downsampled to \(cgImage.width)x\(cgImage.height): availMem=\(Self.availableMemoryMB())MB")
        let instructions = call.getString("instructions") ?? ""
        let prompt = call.getString("prompt")
            ?? "Read this photo of a shopping list or meal plan and produce the full shopping list."

        #if canImport(FoundationModels)
        if #available(iOS 27.0, *) {
            Task {
                let options = GenerationOptions(temperature: 0.2, maximumResponseTokens: 2048)

                func run(_ session: LanguageModelSession) async throws -> [[String: Any]] {
                    let response = try await session.respond(
                        generating: ParsedGroceryList.self,
                        options: options
                    ) {
                        prompt
                        Attachment(cgImage)
                    }
                    return response.content.items.map { item in
                        [
                            "name": item.name,
                            "section": item.section.displayName,
                            "forDishes": item.forDishes,
                            "needsClarification": item.needsClarification,
                        ]
                    }
                }

                // Heartbeat: log free memory each second while inference runs,
                // so a jetsam kill leaves a visible death spiral in the console.
                let heartbeat = Task {
                    var tick = 0
                    while !Task.isCancelled {
                        print("⚡️ [AppleLLM] inference t+\(tick)s: availMem=\(Self.availableMemoryMB())MB")
                        tick += 1
                        try? await Task.sleep(nanoseconds: 1_000_000_000)
                    }
                }
                defer { heartbeat.cancel() }

                do {
                    let session = instructions.isEmpty
                        ? LanguageModelSession()
                        : LanguageModelSession(instructions: { instructions })
                    let items = try await run(session)
                    print("⚡️ [AppleLLM] inference done: availMem=\(Self.availableMemoryMB())MB, items=\(items.count)")
                    call.resolve(["items": items, "engine": "onDevice"])
                } catch {
                    // On-device failed (e.g. model assets unavailable). Retry on
                    // Private Cloud Compute — Apple-run, no keys, free tier.
                    // SIMULATOR-ONLY for now: constructing the PCC model without
                    // the private-cloud-compute entitlement is a FATAL ERROR in
                    // this beta, and personal-team device provisioning can't
                    // include that entitlement yet. Remove this split when the
                    // capability opens up for the App ID.
                    #if targetEnvironment(simulator)
                    let pcc = PrivateCloudComputeLanguageModel()
                    guard pcc.isAvailable else {
                        call.reject("Foundation Models error: \(error.localizedDescription) (PCC unavailable: \(String(describing: pcc.availability)))")
                        return
                    }
                    do {
                        let session = instructions.isEmpty
                            ? LanguageModelSession(model: pcc)
                            : LanguageModelSession(model: pcc, instructions: { instructions })
                        let items = try await run(session)
                        call.resolve(["items": items, "engine": "pcc"])
                    } catch let pccError {
                        call.reject("Foundation Models error (on-device: \(error.localizedDescription); PCC: \(pccError.localizedDescription))")
                    }
                    #else
                    call.reject("Foundation Models error: \(error.localizedDescription)")
                    #endif
                }
            }
            return
        }
        #endif
        call.reject("Image input requires iOS 27+")
    }

    @objc func cleanGroceryList(_ call: CAPPluginCall) {
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
                    // Generous token budget + low temperature so the model
                    // faithfully enumerates a long list rather than truncating
                    // or paraphrasing it down to a few items.
                    let options = GenerationOptions(temperature: 0.2, maximumResponseTokens: 2048)
                    let response = try await session.respond(
                        to: prompt,
                        generating: CleanedItemList.self,
                        options: options
                    )
                    let items: [[String: Any]] = response.content.items.map { item in
                        [
                            "name": item.name,
                            "section": item.section.displayName,
                            "forDishes": [String](),
                            "needsClarification": item.needsClarification,
                        ]
                    }
                    call.resolve(["items": items, "engine": "onDevice"])
                } catch {
                    // On-device failed — retry on Private Cloud Compute (iOS 27+).
                    // SIMULATOR-ONLY: see parseImage for why (entitlement is
                    // fatal-if-missing and undeliverable to device builds yet).
                    #if targetEnvironment(simulator)
                    if #available(iOS 27.0, *) {
                        let pcc = PrivateCloudComputeLanguageModel()
                        if pcc.isAvailable {
                            do {
                                let session = instructions.isEmpty
                                    ? LanguageModelSession(model: pcc)
                                    : LanguageModelSession(model: pcc, instructions: { instructions })
                                let options = GenerationOptions(temperature: 0.2, maximumResponseTokens: 2048)
                                let response = try await session.respond(
                                    to: prompt,
                                    generating: CleanedItemList.self,
                                    options: options
                                )
                                let items: [[String: Any]] = response.content.items.map { item in
                                    [
                                        "name": item.name,
                                        "section": item.section.displayName,
                                        "forDishes": [String](),
                                        "needsClarification": item.needsClarification,
                                    ]
                                }
                                call.resolve(["items": items, "engine": "pcc"])
                                return
                            } catch let pccError {
                                call.reject("Foundation Models error (on-device: \(error.localizedDescription); PCC: \(pccError.localizedDescription))")
                                return
                            }
                        }
                    }
                    #endif
                    call.reject("Foundation Models error: \(error.localizedDescription)")
                }
            }
            return
        }
        #endif
        call.reject("FoundationModels requires iOS 26+")
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
                    let options = GenerationOptions(temperature: 0.3, maximumResponseTokens: 2048)
                    let response = try await session.respond(
                        to: prompt,
                        generating: ParsedGroceryList.self,
                        options: options
                    )
                    let items: [[String: Any]] = response.content.items.map { item in
                        [
                            "name": item.name,
                            "section": item.section.displayName,
                            "forDishes": item.forDishes,
                            "needsClarification": item.needsClarification,
                        ]
                    }
                    call.resolve(["items": items, "engine": "onDevice"])
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
