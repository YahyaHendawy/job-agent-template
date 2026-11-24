//
//  ViewController.swift
//  Job Agent (Mac app): your dashboard in its own window, with the Safari autofill extension built in.
//  Works offline: every screen you open is saved on this Mac and shown when there's no internet.
//

import Cocoa
import Network
import SafariServices
import WebKit

let extensionBundleIdentifier = "com.example.jobagent.Extension"
let appURL = URL(string: "https://YOUR-APP.vercel.app/")!

/// Saved copies of screens, stored in the app's own folder on this Mac.
enum OfflineStore {
    static let folder: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("Offline", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()
    /// Key screens kept fresh in the background, so they open offline even if you haven't visited them lately.
    static let core = ["/", "/applications", "/jobs", "/guide", "/activity", "/settings/details"]

    static func file(for url: URL) -> URL {
        var key = url.path.isEmpty ? "/" : url.path
        if let q = url.query, !q.isEmpty, !q.contains("_rsc") { key += "?" + q }
        let safe = key.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "home"
        return folder.appendingPathComponent(String(safe.prefix(200)) + ".html")
    }
    static func save(_ html: String, for url: URL) {
        try? html.write(to: file(for: url), atomically: true, encoding: .utf8)
    }
    static func load(for url: URL) -> (html: String, savedAt: Date)? {
        for f in [file(for: url), file(for: URL(string: url.path, relativeTo: appURL)!.absoluteURL)] {
            if let html = try? String(contentsOf: f, encoding: .utf8),
               let at = (try? f.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate {
                return (html, at)
            }
        }
        return nil
    }
    static func forgetAll() {
        for f in (try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)) ?? [] {
            try? FileManager.default.removeItem(at: f)
        }
    }
}

/// JavaScript that turns the current screen into a self-contained page: styles inlined, scripts removed.
let snapshotJS = """
(function(){
  try {
    var css = '';
    for (var i = 0; i < document.styleSheets.length; i++) {
      try { var r = document.styleSheets[i].cssRules; for (var j = 0; j < r.length; j++) css += r[j].cssText + '\\n'; } catch (e) {}
    }
    var doc = document.documentElement.cloneNode(true);
    doc.querySelectorAll('script, link[rel=stylesheet], link[rel=preload], link[rel=modulepreload], #ja-ext-bar, #ja-offline').forEach(function(n){ n.remove(); });
    doc.querySelectorAll('textarea').forEach(function(t, i){ var live = document.querySelectorAll('textarea')[i]; if (live) t.textContent = live.value; });
    var head = doc.querySelector('head'); var st = document.createElement('style'); st.textContent = css; head.appendChild(st);
    var body = doc.querySelector('body'); if (body) body.style.paddingTop = '';
    return '<!doctype html>' + doc.outerHTML;
  } catch (e) { return ''; }
})();
"""

class ViewController: NSViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!
    private let monitor = NWPathMonitor()
    private var isOnline = true
    private var showingSavedCopyOf: URL?
    private var warmer: WKWebView?
    private var warmQueue: [String] = []
    private var lastWarm = Date.distantPast

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.configuration.userContentController.add(self, name: "controller")
        webView.customUserAgent = nil

        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                guard let self = self else { return }
                let now = path.status == .satisfied
                let cameBack = now && !self.isOnline
                self.isOnline = now
                if cameBack, let url = self.showingSavedCopyOf {   // back online: swap the saved copy for the live screen
                    self.showingSavedCopyOf = nil
                    self.webView.load(URLRequest(url: url))
                }
                if now { self.warmSoon() }
            }
        }
        monitor.start(queue: DispatchQueue.global(qos: .utility))

        webView.load(URLRequest(url: appURL))
        Timer.scheduledTimer(withTimeInterval: 20 * 60, repeats: true) { [weak self] _ in self?.warmSoon() }
    }

    override func viewDidAppear() {
        super.viewDidAppear()
        guard let window = view.window else { return }
        window.title = "Job Agent"
        window.styleMask.insert(.resizable)
        window.minSize = NSSize(width: 420, height: 560)
        if window.frame.width < 900 {
            window.setContentSize(NSSize(width: 1180, height: 820))
            window.center()
        }
        window.setFrameAutosaveName("JobAgentMain")
    }

    // MARK: Offline

    private func isOfflineError(_ error: Error) -> Bool {
        let codes: Set<Int> = [NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorCannotFindHost,
                               NSURLErrorCannotConnectToHost, NSURLErrorTimedOut, NSURLErrorDNSLookupFailed,
                               NSURLErrorInternationalRoamingOff, NSURLErrorDataNotAllowed, NSURLErrorSecureConnectionFailed]
        let e = error as NSError
        return e.domain == NSURLErrorDomain && codes.contains(e.code)
    }

    private func showSavedCopy(for url: URL) {
        let target = url.host == appURL.host ? url : appURL
        showingSavedCopyOf = target
        let fmt = DateFormatter(); fmt.dateFormat = "EEE d MMM, h:mma"
        if let saved = OfflineStore.load(for: target) ?? OfflineStore.load(for: appURL) {
            let strip = """
            <div id="ja-offline" style="position:fixed;left:50%;transform:translateX(-50%);bottom:24px;z-index:2147483647;background:#1f2430;color:#fff;font:600 13px -apple-system;padding:9px 14px;border-radius:999px;box-shadow:0 6px 24px rgba(0,0,0,.25)">📴 Offline · saved copy from \(fmt.string(from: saved.savedAt)). It switches back by itself when you're online.</div>
            """
            let html = saved.html.replacingOccurrences(of: "</body>", with: strip + "</body>")
            webView.loadHTMLString(html, baseURL: target)
        } else {
            webView.loadHTMLString("""
            <!doctype html><meta charset="utf-8"><body style="font:16px -apple-system;display:grid;place-items:center;height:100vh;margin:0;background:#f5f6f8;color:#14161b">
            <div style="max-width:420px;background:#fff;padding:24px;border-radius:20px"><div style="font-size:40px">📴</div><h2>You're offline</h2>
            <p style="color:#5d6470">This screen hasn't been saved on this Mac yet. Your agent is still working in the cloud. It doesn't need your Mac.</p>
            <p style="color:#5d6470">It reopens by itself when you're back online.</p></div></body>
            """, baseURL: appURL)
        }
    }

    private func snapshot(_ wv: WKWebView, url: URL) {
        guard url.host == appURL.host else { return }
        if url.path.hasPrefix("/login") || url.path.hasPrefix("/setup") { OfflineStore.forgetAll(); return } // signed out
        wv.evaluateJavaScript(snapshotJS) { result, _ in
            if let html = result as? String, html.count > 500 { OfflineStore.save(html, for: url) }
        }
    }

    /// Opens key screens in an invisible window and saves them, so they're ready offline.
    private func warmSoon() {
        guard isOnline, warmer == nil, Date().timeIntervalSince(lastWarm) > 15 * 60 else { return }
        lastWarm = Date()
        warmQueue = OfflineStore.core
        let w = WKWebView(frame: NSRect(x: 0, y: 0, width: 1180, height: 820), configuration: webView.configuration)
        w.navigationDelegate = self
        warmer = w
        warmNext()
    }

    private func warmNext() {
        guard let w = warmer else { return }
        guard isOnline, !warmQueue.isEmpty else { warmer = nil; return }
        let path = warmQueue.removeFirst()
        w.load(URLRequest(url: URL(string: path, relativeTo: appURL)!.absoluteURL))
    }

    // MARK: Navigation

    // Keep the dashboard inside the app; send everything else (employer sites, PDFs, autofill setup) to Safari.
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.allow) }
        if webView === warmer { return decisionHandler(url.host == appURL.host ? .allow : .cancel) }
        let sameHost = url.host == appURL.host
        let mustUseSafari = url.path.hasPrefix("/settings/autofill") || url.path.hasPrefix("/api/applications/")
        if navigationAction.navigationType == .linkActivated && (!sameHost || mustUseSafari) {
            NSWorkspace.shared.open(url)
            return decisionHandler(.cancel)
        }
        if !sameHost && url.scheme != "about" {
            NSWorkspace.shared.open(url)
            return decisionHandler(.cancel)
        }
        // A link tapped inside a saved copy while still offline: show that screen's saved copy too.
        if showingSavedCopyOf != nil && !isOnline && navigationAction.navigationType == .linkActivated {
            showSavedCopy(for: url)
            return decisionHandler(.cancel)
        }
        decisionHandler(.allow)
    }

    // target="_blank" links → Safari
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if webView === warmer { warmNext(); return }
        guard isOfflineError(error) else { return }
        let failed = ((error as NSError).userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? webView.url ?? appURL
        showSavedCopy(for: failed)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if webView === warmer { warmNext() }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === warmer {
            if let url = webView.url { snapshot(webView, url: url) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.warmNext() }
            return
        }
        // a saved copy is loaded with loadHTMLString: don't save it again or show the extension banner over it
        if showingSavedCopyOf != nil { return }
        if let url = webView.url {
            // give the screen a moment to finish drawing its live data before saving it
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self, weak webView] in
                guard let self = self, let webView = webView, webView.url == url, self.showingSavedCopyOf == nil else { return }
                self.snapshot(webView, url: url)
            }
        }
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            let enabled = state?.isEnabled ?? false
            DispatchQueue.main.async {
                let js = """
                (function(){
                  var old = document.getElementById('ja-ext-bar'); if (old) { old.remove(); document.body.style.paddingTop = ''; }
                  if (\(enabled ? "true" : "false")) return;
                  var b = document.createElement('div'); b.id = 'ja-ext-bar';
                  b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#2457f5;color:#fff;font:600 13px -apple-system;padding:8px 12px;display:flex;gap:10px;align-items:center;justify-content:center';
                  b.innerHTML = 'Turn on Safari autofill to fill application forms in one click.';
                  var btn = document.createElement('button'); btn.textContent = 'Enable in Safari';
                  btn.style.cssText = 'background:#fff;color:#2457f5;border:0;border-radius:8px;padding:5px 10px;font:600 13px -apple-system;cursor:pointer';
                  btn.onclick = function(){ window.webkit.messageHandlers.controller.postMessage('open-preferences'); };
                  b.appendChild(btn); document.body.appendChild(b); document.body.style.paddingTop = '38px';
                })();
                """
                webView.evaluateJavaScript(js)
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? String, body == "open-preferences" else { return }
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { _ in }
    }
}
