import UIKit

/// The "Review" share extension.
///
/// It receives a PDF, a file URL or a web page from the share sheet, writes it
/// into the shared App Group container's `inbox/`, and gets out of the way. It
/// deliberately does not present a UI beyond a confirmation: the point is to be
/// under three taps from Safari to the library.
///
/// Left as a bare view controller on purpose — it has to compile today, against
/// a package whose ingest code does not exist yet.
final class ShareViewController: UIViewController {

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)

        // WAVE 2 (U11): implemented by the share extension unit
        //
        // Until then, complete immediately rather than leaving the host app's
        // share sheet spinning with no way out.
        extensionContext?.completeRequest(returningItems: [])
    }
}
