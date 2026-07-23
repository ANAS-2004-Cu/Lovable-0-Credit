import { computeFingerprint } from "./lib/fingerprint.js";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "OFFSCREEN_COMPUTE_FINGERPRINT") return;
  (async () => {
    try {
      const fp = await computeFingerprint();
      sendResponse({ ok: true, ...fp });
    } catch (e) {
      sendResponse({ ok: false, reason: "fingerprint_failed", detail: String(e?.message || e) });
    }
  })();
  return true;
});