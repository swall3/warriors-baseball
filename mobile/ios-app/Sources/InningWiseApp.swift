import SwiftUI
import WebKit

@main
struct InningWiseApp: App {
    var body: some Scene {
        WindowGroup {
            InningWiseBrowser()
                .ignoresSafeArea(edges: .bottom)
        }
    }
}

private struct InningWiseBrowser: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> BrowserController {
        BrowserController()
    }

    func updateUIViewController(_ controller: BrowserController, context: Context) {}
}

final class BrowserController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let home = URL(string: "https://inningwise.com/")!
    private var browser: WKWebView!

    override func loadView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true

        browser = WKWebView(frame: .zero, configuration: configuration)
        browser.navigationDelegate = self
        browser.uiDelegate = self
        browser.allowsBackForwardNavigationGestures = true
        browser.scrollView.contentInsetAdjustmentBehavior = .automatic
        view = browser
        browser.load(URLRequest(url: home))
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.scheme == "https", url.host == home.host {
            decisionHandler(.allow)
        } else {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if url.scheme == "https", url.host == home.host {
            webView.load(URLRequest(url: url))
        } else {
            UIApplication.shared.open(url)
        }
        return nil
    }
}
