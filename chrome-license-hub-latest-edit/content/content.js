/**
 * Content Script (ISOLATED) — bridges MAIN-world inject to background.
 */
(function () {
  function injectScript() {
    if (document.documentElement.dataset.lepInjected) return;
    document.documentElement.dataset.lepInjected = "1";
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("content/inject_v2.js");
    script.onload = function () { this.remove(); };
    (document.head || document.documentElement).appendChild(script);
  }
  injectScript();

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || !d.type) return;

    // التحقق السريع من الترخيص (لا يسبب أي تأخير للحقن)
    if (d.type === "VERIFY_NOW" && d.reqId) {
      chrome.runtime.sendMessage({ type: "CHECK_LICENSE_CACHE" }, (resp) => {
        if (chrome.runtime.lastError) {
            window.postMessage({ type: "VERIFY_RESULT", reqId: d.reqId, license_valid: true }, "*");
            return;
        }
        window.postMessage({
          type: "VERIFY_RESULT",
          reqId: d.reqId,
          license_valid: !!(resp && resp.valid)
        }, "*");
      });
    }

    // تحويل النية عبر السيرفر
    if (d.type === "SERVER_TRANSFORM" && d.reqId) {
      chrome.runtime.sendMessage(
        { type: "SERVER_TRANSFORM", prompt: d.prompt },
        (resp) => {
          if (chrome.runtime.lastError) {
              window.postMessage({ type: "SERVER_TRANSFORM_RESULT", reqId: d.reqId, result: null }, "*");
              return;
          }
          window.postMessage({ type: "SERVER_TRANSFORM_RESULT", reqId: d.reqId, result: resp || null }, "*");
        }
      );
    }

    // التقاط إشعار نجاح عملية التخطي وإرساله للخلفية لزيادة العداد
    if (d.type === "LOG_SUCCESS_INJECTION") {
      chrome.runtime.sendMessage({ type: "INCREMENT_INJECTION" });
    }
  });
})();