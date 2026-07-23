/**
 * Lovable Enhancer Pro — Inject (MAIN world)
 * Fix_Error Injection Mode - Final Fix
 */
(function () {
  if (window.__LEP_INJECT_ACTIVE__) return;
  window.__LEP_INJECT_ACTIVE__ = true;

  const nativeFetch = window.fetch.bind(window);
  const originalFetch = nativeFetch;
  let patchedFetch = null;

  let licenseValid = true; // الافتراضي مفعل لتجنب تأخير أول رسالة
  let lastVerifiedAt = 0;
  const VERIFY_TTL_MS = 30000; 

  function verifyNow() {
    return new Promise((resolve) => {
      const reqId = "v_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      let finished = false;
      
      const tm = setTimeout(() => {
        if (finished) return;
        finished = true;
        resolve(licenseValid); // إذا تأخر الرد، اعتمد آخر حالة معروفة
      }, 2000);

      const onMsg = (ev) => {
        if (ev.source !== window) return;
        const d = ev.data;
        if (d && d.type === "VERIFY_RESULT" && d.reqId === reqId) {
          if (finished) return;
          finished = true;
          window.removeEventListener("message", onMsg);
          clearTimeout(tm);
          licenseValid = !!d.license_valid;
          lastVerifiedAt = Date.now();
          resolve(licenseValid);
        }
      };
      window.addEventListener("message", onMsg);
      window.postMessage({ type: "VERIFY_NOW", reqId }, "*");
    });
  }

  function serverTransform(prompt) {
    return new Promise((resolve) => {
      const reqId = "t_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      let finished = false;

      const tm = setTimeout(() => {
        if (finished) return;
        finished = true;
        resolve(null); // إذا لم يرد السيرفر خلال 5 ثواني، ألغِ الحقن
      }, 5000);

      const onMsg = (ev) => {
        if (ev.source !== window) return;
        const d = ev.data;
        if (d && d.type === "SERVER_TRANSFORM_RESULT" && d.reqId === reqId) {
          if (finished) return;
          finished = true;
          window.removeEventListener("message", onMsg);
          clearTimeout(tm);
          resolve(d.result || null);
        }
      };
      window.addEventListener("message", onMsg);
      window.postMessage({ type: "SERVER_TRANSFORM", reqId, prompt }, "*");
    });
  }

  // تضمين كافة الحقول التي ينتظرها Lovable لمنع تعطل الواجهة
  function applyServerFields(baseBody, fields) {
    return Object.assign({}, baseBody, fields, {
      thread_id: baseBody.thread_id || "main",
      view: baseBody.view || "preview",
      view_description: baseBody.view_description || "The user is currently viewing the preview. ",
      current_page: baseBody.current_page || "/",
      current_viewport_width: window.innerWidth || 1200,
      current_viewport_height: window.innerHeight || 800,
      current_viewport_dpr: window.devicePixelRatio || 1,
      session_replay: baseBody.session_replay || "",
      client_logs: baseBody.client_logs || [],
      network_requests: baseBody.network_requests || [],
      runtime_errors: baseBody.runtime_errors || [],
      integration_metadata: baseBody.integration_metadata || { browser: {} },
      files: baseBody.files || [],
      selected_elements: baseBody.selected_elements || [],
      optimisticImageUrls: baseBody.optimisticImageUrls || [],
    });
  }

  async function lepFetch(...args) {
    const resource = args[0];
    const config = args[1];
    
    const urlStr = typeof resource === "string" ? resource : (resource && resource.url) || "";
    
    const isChat = (urlStr.includes("lovable") || urlStr.startsWith("/")) && /\/chat\b/i.test(urlStr);

    if (isChat && config && config.body) {
      if (Date.now() - lastVerifiedAt > VERIFY_TTL_MS) await verifyNow();
      
      if (!licenseValid) {
          console.log("[Lovable Enhancer Pro] ⚠️ Extension is not active. Using original fetch.");
          return originalFetch.apply(this, args);
      }

      let body;
      try { body = JSON.parse(config.body); } catch { return originalFetch.apply(this, args); }

      if (body.intent === "fix_error") return originalFetch.apply(this, args);

      const prompt = (body.message || body.prompt || "").toString();
      if (!prompt) return originalFetch.apply(this, args);

      console.log("[Lovable Enhancer Pro] ⏳ Request intercepted. Getting Fix_Error payload from server...");

      const result = await serverTransform(prompt);
      
      if (result && result.ok && result.fields) {
        // الاستنساخ الآمن (Safe Cloning) بدلاً من تعديل الكائن الأصلي
        const newConfig = Object.assign({}, config);
        newConfig.body = JSON.stringify(applyServerFields(body, result.fields));
        args[1] = newConfig;
        
        console.log("[Lovable Enhancer Pro] ✅ Success! Fix_Error Payload Injected.");
        
        // إرسال إشعار للإضافة بزيادة العداد (يجب أن يلتقطه content.js)
        window.postMessage({ type: "LOG_SUCCESS_INJECTION" }, "*");
      } else {
        console.log("[Lovable Enhancer Pro] ❌ Failed to get payload from server. Sending original request.");
      }

      return originalFetch.apply(this, args);
    }

    return originalFetch.apply(this, args);
  }

  function installFetchHook() {
    if (!patchedFetch) {
      patchedFetch = function (...args) { return lepFetch.apply(this, args); };
    }
    if (window.fetch === patchedFetch) return;
    try {
      Object.defineProperty(window, "fetch", { configurable: true, writable: true, value: patchedFetch });
    } catch { 
      window.fetch = patchedFetch; 
    }
  }

  installFetchHook();
  setInterval(installFetchHook, 2000);
})();