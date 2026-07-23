/**
 * Lovable Enhancer Pro — Background Service Worker
 * Subscription & Fix_Error Injection Mode
 */

const API_BASE = "https://lovable-pro-server.vercel.app";
const api = (path) => `${API_BASE}${path}`;

const API_URL = () => api("/api/public/license/validate");
const AUTO_TRIAL_URL = () => api("/api/public/trial/auto-license");
const VERSION_URL = () => api("/api/public/extension/version");
const DEACTIVATE_URL = () => api("/api/public/license/deactivate");
const TRANSFORM_URL = () => api("/api/public/license/transform");
const HEALTH_URL = () => api("/api/public/health"); 

const VERSION = chrome.runtime.getManifest().version;

let serverIsOnline = false; 

// تم تصحيح هذه الدالة لتقبل المعرفات البديلة (Fallback) وتمنع تكرار الحسابات
function isStableDeviceHash(value) {
  return typeof value === 'string' && value.length >= 30;
}

async function configureActionUI() {
  try {
    await chrome.action.setPopup({ popup: "" });
  } catch {}
  try {
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    }
  } catch {}
}

async function checkServerHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); 
    
    const ping = await fetch(`${HEALTH_URL()}?t=${Date.now()}`, { 
      method: "GET", 
      signal: controller.signal, 
      cache: "no-store" 
    });
    
    clearTimeout(timeoutId);
    
    if (ping.ok) {
      const data = await ping.json();
      serverIsOnline = data.status === "online";
    } else {
      serverIsOnline = false;
    }
  } catch {
    serverIsOnline = false;
  }
  
  chrome.runtime.sendMessage({ type: "SERVER_STATUS_UPDATED", online: serverIsOnline }).catch(() => {});
  return serverIsOnline;
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureStableFingerprint();
  await configureActionUI();
  checkServerHealth();
});

chrome.runtime.onStartup.addListener(async () => {
  await configureActionUI();
  checkServerHealth();
});

// استدعاء النافذة المخفية لإنشاء البصمة المعقدة (WebGL)
async function getRealFingerprint() {
  try {
    const hasDoc = await chrome.offscreen.hasDocument();
    if (!hasDoc) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['DOM_PARSER'], 
        justification: 'Get deep device fingerprint'
      });
    }
    const fp = await chrome.runtime.sendMessage({ type: "OFFSCREEN_COMPUTE_FINGERPRINT" });
    if (fp && fp.ok) {
      return { hash: fp.device_hash, components: fp.components };
    }
  } catch (e) {
    console.warn("Offscreen Fingerprint generation skipped or delayed.");
  }
  return null;
}

// توليد أو جلب معرف الجهاز
async function ensureStableFingerprint() {
  const cached = await chrome.storage.local.get(["device_hash", "fp_components"]);
  
  // إذا كانت البصمة والمعرف موجودين وكاملين، لا داعي لإعادة المعالجة
  if (isStableDeviceHash(cached.device_hash) && cached.fp_components && Object.keys(cached.fp_components).length > 0) {
    return { hash: cached.device_hash, components: cached.fp_components };
  }

  // محاولة جلب البصمة المعقدة الفعلية عبر Offscreen
  const realFp = await getRealFingerprint();
  if (realFp && realFp.hash) {
    await chrome.storage.local.set({ device_hash: realFp.hash, fp_components: realFp.components });
    return realFp;
  }

  // في حال فشل المتصفح في إنشاء النافذة المخفية، يتم استخدام المعرف المخزن مسبقاً
  if (isStableDeviceHash(cached.device_hash)) {
    return { hash: cached.device_hash, components: {} };
  }

  // الحل الأخير: توليد معرف عشوائي نظيف بدون كلمة dev_
  const fallback = crypto.randomUUID().replace(/-/g, '') + Date.now().toString(16);
  await chrome.storage.local.set({ device_hash: fallback, fp_components: {} });
  return { hash: fallback, components: {} };
}

async function checkForUpdate() {
  try {
    const res = await fetch(VERSION_URL() + "?v=" + encodeURIComponent(VERSION), { cache: "no-store" });
    if (!res.ok) return null;
    const info = await res.json();
    const currentVer = VERSION.split('.').map(Number);
    const newVer = info.version.split('.').map(Number);
    let hasUpdate = false;
    
    for (let i = 0; i < 3; i++) {
      if ((newVer[i] || 0) > (currentVer[i] || 0)) { hasUpdate = true; break; }
      if ((newVer[i] || 0) < (currentVer[i] || 0)) break;
    }

    const isMandatory = info.mandatory === true;
    const payload = { ...info, has_update: hasUpdate || isMandatory, mandatory: isMandatory };
    await chrome.storage.local.set({ update_info: payload });
    return payload;
  } catch { return null; }
}

async function validateLicense() {
  const { license_key, license_cache, injection_count } = await chrome.storage.local.get(["license_key", "license_cache", "injection_count"]);
  if (!license_key) return { valid: false, reason: "no_key" };

  try {
    const fp = await ensureStableFingerprint();
    const res = await fetch(API_URL(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        license_key, 
        device_hash: fp.hash, 
        components: fp.components,
        usage_count: injection_count || 0 
      }),
    });
    
    const data = await res.json();
    if (data.valid) {
      await chrome.storage.local.set({ 
        license_cache: data,
        injection_count: data.usage_count !== undefined ? data.usage_count : (injection_count || 0)
      });
    } else {
      await chrome.storage.local.remove(["license_cache"]);
    }
    return data;
  } catch (e) {
    if (license_cache && license_cache.valid) return { ...license_cache, offline: true };
    return { valid: false, reason: "network_error" };
  }
}

async function ensureTrialLicense() {
  try {
    const { license_cache, injection_count } = await chrome.storage.local.get(["license_cache", "injection_count"]);
    if (license_cache && license_cache.valid) return { valid: false, reason: "license_already_active" };

    const fp = await ensureStableFingerprint();
    const res = await fetch(AUTO_TRIAL_URL(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        device_hash: fp.hash, 
        components: fp.components,
        usage_count: injection_count || 0 
      }),
    });
    
    const data = await res.json();
    if (data && data.ok && data.license_key) {
      const cache = {
        valid: true,
        trial: true,
        plan: data.plan,
        expires_at: data.expires_at,
      };
      await chrome.storage.local.set({
        license_key: data.license_key,
        license_cache: cache,
        injection_count: data.usage_count !== undefined ? data.usage_count : (injection_count || 0)
      });
      return { valid: true, ...cache };
    }
    return { valid: false, reason: "already_used", detail: data?.detail };
  } catch (e) {
    return { valid: false, reason: "network_error" };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "FORCE_CHECK_SERVER") {
    checkServerHealth().then(isOnline => {
      sendResponse({ online: isOnline });
    });
    return true;
  }

  if (message.type === "INCREMENT_INJECTION") {
    chrome.storage.local.get(["injection_count"], (r) => {
      const newCount = (r.injection_count || 0) + 1;
      chrome.storage.local.set({ injection_count: newCount });
    });
    return true;
  }

  if (message.type === "CHECK_LICENSE_CACHE") {
    chrome.storage.local.get(["license_cache"], (r) => {
      sendResponse({ valid: !!(r.license_cache && r.license_cache.valid) });
    });
    return true;
  }

if (message.type === "GET_STATE") {
    chrome.storage.local.get(["license_key", "license_cache", "update_info", "device_hash", "injection_count"], async (r) => {
      
      // الاعتماد التام على الكاش فقط لمنع الـ Infinite Loop وإرهاق السيرفر
      let license = r.license_cache || null;
      
      const deviceHash = r.device_hash || await ensureStableFingerprint();

      sendResponse({
        success: true,
        data: {
          version: VERSION,
          update_info: r.update_info,
          license_key: r.license_key || null,
          license: license,
          device_hash: deviceHash.hash || deviceHash,
          injection_count: r.injection_count || 0,
          server_online: serverIsOnline 
        }
      });
    });
    return true;
  }

  if (message.type === "ACTIVATE_LICENSE") {
    (async () => {
      await chrome.storage.local.set({ license_key: message.key });
      const result = await validateLicense();
      sendResponse({ success: true, result });
    })();
    return true;
  }

  if (message.type === "ENSURE_TRIAL_LICENSE") {
    ensureTrialLicense().then((r) => sendResponse({ success: !!r?.valid, result: r }));
    return true;
  }

  if (message.type === "DEACTIVATE_LICENSE") {
    chrome.storage.local.remove(["license_key", "license_cache"], () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "SERVER_TRANSFORM") {
    (async () => {
      try {
        const { license_key } = await chrome.storage.local.get(["license_key"]);
        if (!license_key) return sendResponse({ ok: false, reason: "no_key" });
        
        const fp = await ensureStableFingerprint();
        const res = await fetch(TRANSFORM_URL(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            license_key,
            device_id: fp.hash,
            prompt: message.prompt || "",
            strategy: "fix_error"
          }),
        });
        
        const data = await res.json();
        sendResponse(data);
      } catch (e) {
        sendResponse({ ok: false, reason: "network_error" });
      }
    })();
    return true;
  }
});

chrome.alarms.create("license-recheck", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === "license-recheck") {
    await validateLicense();
    await checkForUpdate();
  }
});