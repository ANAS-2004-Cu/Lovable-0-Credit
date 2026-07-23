// Device fingerprint for trial abuse prevention.
// Runs in popup context (has document/canvas/webgl access).
// Produces { device_hash, components } — components used server-side for fuzzy match.

async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canvasFP() {
  try {
    const c = document.createElement("canvas");
    c.width = 260; c.height = 60;
    const ctx = c.getContext("2d");
    if (!ctx) return "no-canvas";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = "#069";
    ctx.fillText("Lovable-Enhancer-🔒", 2, 15);
    ctx.strokeStyle = "rgba(102,204,0,0.7)";
    ctx.beginPath(); ctx.arc(50, 30, 20, 0, Math.PI * 2); ctx.stroke();
    return c.toDataURL();
  } catch { return "canvas-err"; }
}

function webglFP() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return "no-webgl";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return `${vendor}|${renderer}|${gl.getParameter(gl.VERSION)}`;
  } catch { return "webgl-err"; }
}

async function audioFP() {
  try {
    const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctx) return "no-audio";
    const ctx = new Ctx(1, 44100, 44100);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(10000, ctx.currentTime);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-50, ctx.currentTime);
    comp.knee.setValueAtTime(40, ctx.currentTime);
    comp.ratio.setValueAtTime(12, ctx.currentTime);
    comp.attack.setValueAtTime(0, ctx.currentTime);
    comp.release.setValueAtTime(0.25, ctx.currentTime);
    osc.connect(comp); comp.connect(ctx.destination); osc.start(0);
    const buf = await ctx.startRendering();
    let sum = 0;
    const data = buf.getChannelData(0);
    for (let i = 4500; i < 5000; i++) sum += Math.abs(data[i] || 0);
    return sum.toString();
  } catch { return "audio-err"; }
}

function fontsFP() {
  try {
    const base = ["monospace", "sans-serif", "serif"];
    const test = ["Arial","Courier New","Georgia","Tahoma","Times New Roman","Verdana","Cairo","Impact","Comic Sans MS"];
    const span = document.createElement("span");
    span.style.cssText = "position:absolute;left:-9999px;font-size:72px;visibility:hidden";
    span.textContent = "mmmmmmmmmmlli";
    document.body.appendChild(span);
    const baseline = {};
    for (const b of base) { span.style.fontFamily = b; baseline[b] = [span.offsetWidth, span.offsetHeight]; }
    const detected = [];
    for (const f of test) {
      let matched = false;
      for (const b of base) {
        span.style.fontFamily = `'${f}',${b}`;
        if (span.offsetWidth !== baseline[b][0] || span.offsetHeight !== baseline[b][1]) { matched = true; break; }
      }
      if (matched) detected.push(f);
    }
    document.body.removeChild(span);
    return detected.join(",");
  } catch { return "fonts-err"; }
}

export async function computeFingerprint() {
  // الاعتماد فقط على القطع الصلبة (Hardware) لعبور المتصفحات
  const components = {
    platform: navigator.platform || "?",
    screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
    hw: `${navigator.hardwareConcurrency || 0}x${navigator.deviceMemory || 0}`,
    canvas: await sha256Hex(canvasFP()),
    webgl: await sha256Hex(webglFP()),
    audio: await sha256Hex(await audioFP()),
    fonts: await sha256Hex(fontsFP()),
  };
  
  // دمج القيم لإنشاء الهاش الأساسي (للاستخدام السريع)
  const combined = Object.entries(components).map(([k, v]) => `${k}=${v}`).join("|");
  const device_hash = await sha256Hex(combined);
  
  // إرجاع الهاش والمكونات المنفصلة للسيرفر ليقوم بتحليلها
  return { device_hash, components };
}