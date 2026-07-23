/**
 * Lovable Enhancer Pro - Sidepanel Controller
 * VibeCoding Theme - Version 1.0.0
 */

const state = {
  data: null,
  activeProjectId: null,
  projectTabs: [],
  targetTabId: null
};

const $ = (id) => document.getElementById(id);
const show = (el, on) => el && el.classList.toggle("hidden", !on);

// تفعيل نظام التبويبات (Tabs)
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.add("hidden"));
    
    tab.classList.add("active");
    $(tab.dataset.target).classList.remove("hidden");
  });
});

// استخراج معرف المشروع
function projectIdFromUrl(url) {
  const m = String(url || "").match(/lovable\.dev\/projects\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// تحديث قائمة التبويبات المفتوحة
function refreshProjectTabs() {
  if (!chrome.tabs?.query) return;
  chrome.tabs.query({ url: "https://lovable.dev/projects/*" }, (tabs) => {
    const normalized = (tabs || []).map((t) => ({
      id: t.id,
      url: t.url || "",
      title: (t.title || "").replace(/\s+[-|].*$/, "").trim() || "Lovable Project",
      active: !!t.active,
      projectId: projectIdFromUrl(t.url)
    })).filter(t => t.projectId);

    state.projectTabs = normalized;
    
    const activeTab = normalized.find((t) => t.active) || normalized[0];
    if (activeTab) {
      state.targetTabId = activeTab.id;
      state.activeProjectId = activeTab.projectId;
    } else {
      state.targetTabId = null;
      state.activeProjectId = null;
    }
    
    renderProjectPicker();
  });
}

function renderProjectPicker() {
  const select = $("chat-project-select");
  const info = $("chat-project");
  if (!select || !info) return;

  select.innerHTML = "";
  if (!state.projectTabs.length) {
    select.disabled = true;
    select.innerHTML = "<option value=''>لا يوجد مشروع مفتوح</option>";
    info.textContent = "افتح مشروع lovable.dev/projects/…";
    return;
  }

  select.disabled = false;
  state.projectTabs.forEach((tab) => {
    const opt = document.createElement("option");
    opt.value = String(tab.id);
    opt.textContent = `${tab.title.slice(0, 20)}... (${tab.projectId.slice(0, 8)})`;
    select.appendChild(opt);
  });
  
  select.value = String(state.targetTabId);
  info.textContent = `متصل: ${state.activeProjectId}`;
}

// زر إعادة تحميل تبويب المشروع
$("refresh-project-btn").addEventListener("click", () => {
  if (state.targetTabId) {
    const btn = $("refresh-project-btn");
    btn.style.transform = "rotate(180deg)";
    chrome.tabs.reload(state.targetTabId, () => {
      $("chat-project").textContent = "تم تحديث صفحة المشروع...";
      setTimeout(() => {
        refreshProjectTabs();
        btn.style.transform = "none";
      }, 1500);
    });
  }
});

// دوال تنسيق التواريخ والوقت
function formatDate(isoDate) {
  if (!isoDate) return "غير متوفر";
  const date = new Date(isoDate);
  return date.toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatTimeLeftAdvanced(isoDate) {
  if (!isoDate) return "غير محدود";
  const ms = new Date(isoDate).getTime() - Date.now();
  if (ms <= 0) return "منتهي الصلاحية";
  
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  
  if (d >= 1) return `${d} أيام`;
  if (h >= 1) return `${h} ساعة و ${m} دقيقة`;
  return `${m} دقيقة`;
}

function loadState() {
  chrome.runtime.sendMessage({ type: "GET_STATE" }, (r) => {
    if (!r || !r.success) return;
    state.data = r.data;
    renderAll();
  });
}

function renderAll() {
  const d = state.data;
  if (!d) return;

  // 1. شاشة التحديث الإجباري
  if (d.update_info && (d.update_info.has_update || d.update_info.mandatory)) {
    show($("update-gate"), true);
    show($("license-gate"), false);
    show($("main"), false);
    show($("system-status-widget"), false);
    $("ug-download").href = d.update_info.download_url || "#";
    $("ug-current-ver").textContent = d.version || "1.0.0";
    $("ug-new-ver").textContent = d.update_info.version || "1.0.1";
    if (d.update_info.mandatory) {
      $("ug-desc").textContent = "هذه النسخة قديمة جداً ولن تعمل. التحديث إجباري.";
      $("ug-desc").style.color = "var(--danger)";
    } else {
      $("ug-desc").textContent = "يتوفر إصدار جديد يحتوي على تحسينات أمنية. يرجى التحديث.";
      $("ug-desc").style.color = "var(--warning)";
    }
    return;
  } else {
    show($("update-gate"), false);
  }

  // 2. تحديد حالة تسجيل الدخول
  const isValid = !!(d.license && d.license.valid);

  // 3. التحكم في إظهار الشاشات بناءً على حالة الدخول
  if (isValid) {
    show($("license-gate"), false); // إخفاء تسجيل الدخول
    show($("main"), true);          // إظهار التبويبات والخروج
  } else {
    show($("license-gate"), true);  // إظهار تسجيل الدخول
    show($("main"), false);         // إخفاء التبويبات
  }

  // 4. تحديث معلومات لوحة النظام (System Status Widget)
  
  // أ. معرف الجهاز
  if (d.device_hash) {
    $("device-id-text").textContent = d.device_hash.substring(0, 12) + "...";
    $("copy-device-id").onclick = () => {
      navigator.clipboard.writeText(d.device_hash).then(() => {
        const btn = $("copy-device-id");
        btn.textContent = "✅";
        setTimeout(() => btn.textContent = "📋", 1500);
      });
    };
  }

  // ب. حالة السيرفر
  if (!d.server_online) {
    $("server-status").textContent = "مقطوع / غير متصل";
    $("server-status").style.color = "var(--danger)";
    $("server-dot").className = "dot red";
  } else {
    $("server-status").textContent = "متصل";
    $("server-status").style.color = "var(--text)";
    $("server-dot").className = "dot blue";
  }

  // ج. عداد التخطي (يظهر فقط إذا كان مسجلاً للدخول)
  show($("injection-count-row"), isValid);

  // د. حالة وتفاصيل الاشتراك
  if (isValid) {
    $("sub-status-badge").textContent = "نشط";
    $("sub-status-badge").style.background = "var(--primary-2)";
    $("sub-type-badge").textContent = d.license.plan || "PRO";
    $("injection-count-text").textContent = d.injection_count || 0;

    // تحديث بيانات تبويب "الاشتراك"
    $("sub-plan").textContent = d.license.plan || "PRO";
    $("sub-start").textContent = formatDate(d.license.started_at);
    $("sub-end").textContent = formatDate(d.license.expires_at);
    
    const timeLeft = formatTimeLeftAdvanced(d.license.expires_at);
    $("sub-left").textContent = timeLeft;
    const msLeft = new Date(d.license.expires_at).getTime() - Date.now();
    $("sub-left").style.color = (msLeft < 3600000) ? "var(--danger)" : "var(--primary)";
  } else {
    // حالة غير مسجل الدخول
    $("sub-status-badge").textContent = "غير نشط";
    $("sub-status-badge").style.background = "var(--muted)";
    $("sub-type-badge").textContent = "—";
  }
}

function activate() {
  const key = $("license-input").value.trim().toUpperCase();
  if (!key) return;
  const errEl = $("license-error");
  errEl.classList.add("hidden");
  $("activate-btn").disabled = true;
  
  chrome.runtime.sendMessage({ type: "ACTIVATE_LICENSE", key }, (resp) => {
    $("activate-btn").disabled = false;
    
    if (chrome.runtime.lastError) {
      errEl.textContent = "خطأ في الاتصال بالخادم. يرجى المحاولة لاحقاً.";
      errEl.classList.remove("hidden");
      return;
    }

    if (resp?.result?.valid) {
      loadState();
    } else {
      errEl.textContent = resp?.result?.reason === "expired" ? "عذراً، هذا الترخيص منتهي الصلاحية." : "مفتاح غير صحيح أو غير مسجل.";
      errEl.classList.remove("hidden");
    }
  });
}

function startTrial() {
  const errEl = $("license-error");
  const btn = $("trial-auto-btn");
  errEl.classList.add("hidden");
  btn.disabled = true;
  btn.textContent = "جاري التفعيل...";
  
  chrome.runtime.sendMessage({ type: "ENSURE_TRIAL_LICENSE" }, (resp) => {
    btn.disabled = false;
    btn.textContent = "🎁 تفعيل تجربة (30 دقيقة)";
    
    if (chrome.runtime.lastError) {
      errEl.textContent = "خطأ في الاتصال بالخادم. يرجى المحاولة لاحقاً.";
      errEl.classList.remove("hidden");
      return;
    }

    if (resp?.success && resp?.result?.valid) {
      loadState();
    } else {
      errEl.textContent = resp?.result?.detail || "لقد استهلكت الفترة التجريبية لهذا الجهاز مسبقاً.";
      errEl.classList.remove("hidden");
    }
  });
}

function deactivate() {
  if (!confirm("هل تريد تسجيل الخروج من هذا الحساب؟")) return;
  chrome.runtime.sendMessage({ type: "DEACTIVATE_LICENSE" }, () => {
    loadState();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const refreshServerBtn = $("refresh-server-btn");
  if (refreshServerBtn) {
    refreshServerBtn.addEventListener("click", () => {
      refreshServerBtn.style.animation = "pulse 1s infinite"; 
      $("server-status").textContent = "جاري الاتصال...";
      $("server-status").style.color = "var(--warning)";
      $("server-dot").className = "dot";
      
      chrome.runtime.sendMessage({ type: "FORCE_CHECK_SERVER" }, (resp) => {
        refreshServerBtn.style.animation = "none";
        
        if (chrome.runtime.lastError) {
          $("server-status").textContent = "خطأ في الإضافة";
          $("server-status").style.color = "var(--danger)";
          $("server-dot").className = "dot red";
          return;
        }

        if (resp && resp.online) {
          $("server-status").textContent = "متصل";
          $("server-status").style.color = "var(--text)";
          $("server-dot").className = "dot blue";
        } else {
          $("server-status").textContent = "مقطوع / غير متصل";
          $("server-status").style.color = "var(--danger)";
          $("server-dot").className = "dot red";
        }
        loadState();
      });
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SERVER_STATUS_UPDATED") {
      loadState();
    }
  });

  loadState();
  refreshProjectTabs();
  
  $("activate-btn").addEventListener("click", activate);
  $("trial-auto-btn").addEventListener("click", startTrial);
  $("deactivate-btn").addEventListener("click", deactivate);
  
  $("chat-project-select").addEventListener("change", (e) => {
    state.targetTabId = Number(e.target.value) || null;
    const selected = state.projectTabs.find(t => t.id === state.targetTabId);
    if(selected) state.activeProjectId = selected.projectId;
    $("chat-project").textContent = `متصل: ${state.activeProjectId}`;
  });

  setInterval(renderAll, 1000);
  setInterval(() => {
    loadState();
    refreshProjectTabs();
  }, 5000);
});