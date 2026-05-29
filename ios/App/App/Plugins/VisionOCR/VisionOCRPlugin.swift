import Capacitor
import Vision
import UIKit

@objc(VisionOCRPlugin)
public class VisionOCRPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VisionOCRPlugin"
    public let jsName = "VisionOCR"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "recognize", returnType: CAPPluginReturnPromise)
    ]

    @objc func recognize(_ call: CAPPluginCall) {
        guard let base64 = call.getString("imageBase64"),
              let imageData = Data(base64Encoded: base64),
              let uiImage = UIImage(data: imageData),
              let cgImage = uiImage.cgImage else {
            call.reject("Invalid image data")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let request = VNRecognizeTextRequest { req, error in
                if let error = error {
                    call.reject("OCR failed: \(error.localizedDescription)")
                    return
                }
                let observations = req.results as? [VNRecognizedTextObservation] ?? []
                let lines: [[String: Any]] = observations.compactMap { obs in
                    guard let candidate = obs.topCandidates(1).first else { return nil }
                    let box = obs.boundingBox
                    return [
                        "text": candidate.string,
                        "confidence": candidate.confidence,
                        "x": box.origin.x,
                        "y": box.origin.y,
                        "width": box.size.width,
                        "height": box.size.height
                    ]
                }
                call.resolve(["lines": lines])
            }

            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            // Boost grocery vocabulary — extend as user-failure cases come in.
            request.customWords = [
                "romaine", "prosciutto", "broccolini", "kombucha",
                "tempeh", "tahini", "mozzarella", "shiitake"
            ]

            let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
            do {
                try handler.perform([request])
            } catch {
                call.reject("Vision request failed: \(error.localizedDescription)")
            }
        }
    }
}
