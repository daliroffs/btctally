// Trading School: lesson progress, sharing, the position-size calculator and the "theory in practice"
// boxes that read the live record of the Hypr signal engine. Page text comes from window.SCHOOL_T.
(function(){
  var API = "https://hypr.169-58-87-10.sslip.io/api/public/feed";
  var DONE_KEY = "bt:school:done";
  var HIGH_RISK_PCT = 2, DEMO_ACCOUNT = 1000, DEMO_RISK_PCT = 1, LOSS_ROWS = 6, WIN_RATE_HIGH = 50;
  var T = window.SCHOOL_T || {};
  var esc = function(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); };
  var S = window.SCHOOL = {};

  function t(key, vars){
    return String(T[key] == null ? key : T[key]).replace(/\{(\w+)\}/g, function(m, k){ return vars && vars[k] != null ? vars[k] : m; });
  }
  function price(v){
    if (v == null || isNaN(v)) return "—";
    var a = Math.abs(v), dp = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
    return "$" + Number(v).toLocaleString("en-US", {minimumFractionDigits: dp, maximumFractionDigits: dp});
  }
  function money(v){ return "$" + Number(v).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2}); }
  function units(v){
    var a = Math.abs(v), dp = a >= 100 ? 1 : a >= 1 ? 3 : a >= 0.01 ? 4 : 6;
    return Number(v).toLocaleString("en-US", {maximumFractionDigits: dp});
  }
  function signed(v, dp){ return (v > 0 ? "+" : "") + Number(v).toFixed(dp == null ? 2 : dp); }

  // ---------- position sizing (pure) ----------
  // {account, riskPct, entry, stop} -> {riskUsd, distance, stopPct, units, value, leverage, side} or null when the input is unusable
  S.positionSize = function(input){
    var account = +input.account, riskPct = +input.riskPct, entry = +input.entry, stop = +input.stop;
    var usable = [account, riskPct, entry, stop].every(function(n){ return isFinite(n) && n > 0; }) && riskPct <= 100 && entry !== stop;
    if (!usable) return null;
    var riskUsd = account * riskPct / 100, distance = Math.abs(entry - stop), size = riskUsd / distance;
    return {riskUsd: riskUsd, distance: distance, stopPct: distance / entry * 100, units: size, value: size * entry,
            leverage: size * entry / account, side: stop < entry ? "long" : "short"};
  };

  // ---------- progress ----------
  function readDone(){
    try { var v = JSON.parse(localStorage.getItem(DONE_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch(e){ return []; }
  }
  function writeDone(list){ try { localStorage.setItem(DONE_KEY, JSON.stringify(list)); } catch(e){} }
  function paintProgress(){
    var done = readDone(), boxes = document.querySelectorAll(".sc-done"), count = 0;
    boxes.forEach(function(box){
      var on = done.indexOf(box.getAttribute("data-id")) !== -1;
      box.checked = on; if (on) count++;
      box.closest(".sc-lesson").classList.toggle("is-done", on);
    });
    var num = document.getElementById("sc-pnum"), bar = document.getElementById("sc-pbar");
    if (num) num.textContent = count + " / " + boxes.length;
    if (bar){
      bar.style.transform = "scaleX(" + (boxes.length ? count / boxes.length : 0) + ")";
      bar.parentNode.setAttribute("aria-valuenow", count);
    }
  }
  document.addEventListener("change", function(e){
    var box = e.target.closest && e.target.closest(".sc-done"); if (!box) return;
    var id = box.getAttribute("data-id"), rest = readDone().filter(function(x){ return x !== id; });
    writeDone(box.checked ? rest.concat([id]) : rest);
    paintProgress();
  });

  // ---------- open/close all, deep links, share ----------
  var toggle = document.getElementById("sc-toggle");
  if (toggle) toggle.onclick = function(){
    var lessons = document.querySelectorAll(".sc-lesson");
    var open = Array.prototype.some.call(lessons, function(d){ return !d.open; });
    lessons.forEach(function(d){ d.open = open; });
    toggle.textContent = toggle.getAttribute(open ? "data-close" : "data-open");
  };
  function openFromHash(){
    var el = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
    if (el && el.classList.contains("sc-lesson")){ el.open = true; el.scrollIntoView(); }
  }
  window.addEventListener("hashchange", openFromHash);

  var share = document.getElementById("sc-share");
  if (share) share.onclick = function(){
    var url = location.origin + location.pathname;
    if (navigator.share){ navigator.share({title: document.title, text: t("share_text"), url: url}).catch(function(){}); return; }
    var copied = function(){ if (window.BT) BT.toast(t("copied")); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(copied, function(){ prompt("", url); });
    else prompt("", url);
  };

  // ---------- calculator ----------
  function calcWidget(box){
    var field = function(name, label, value, step){
      return '<label><span>' + esc(t(label)) + '</span><input class="in num" name="' + name + '" type="number" inputmode="decimal" min="0" step="' + step + '" value="' + value + '"></label>';
    };
    box.classList.add("sc-calc");
    box.innerHTML = '<b class="sc-box-t">' + esc(t("calc_title")) + '</b><form class="sc-calc-in" novalidate>' +
      field("account", "calc_account", 2000, "any") + field("riskPct", "calc_risk", 1, "0.1") +
      field("entry", "calc_entry", 64000, "any") + field("stop", "calc_stop", 62720, "any") + '</form><div class="sc-calc-out" aria-live="polite"></div>';
    var form = box.querySelector("form"), out = box.querySelector(".sc-calc-out");
    function cell(label, value){ return '<div><small>' + esc(t(label)) + '</small><b class="num">' + value + '</b></div>'; }
    function paint(){
      var r = S.positionSize({account: form.account.value, riskPct: form.riskPct.value, entry: form.entry.value, stop: form.stop.value});
      if (!r){ out.innerHTML = '<p class="sc-calc-msg">' + esc(t("calc_error")) + '</p>'; return; }
      var notes = "";
      if (+form.riskPct.value > HIGH_RISK_PCT) notes += '<p class="sc-calc-msg warn">' + esc(t("calc_high_risk")) + '</p>';
      if (r.leverage > 1) notes += '<p class="sc-calc-msg">' + esc(t("calc_leverage", {x: r.leverage.toFixed(1), risk: money(r.riskUsd)})) + '</p>';
      out.innerHTML = '<div class="sc-tiles">' +
        cell("calc_risk_usd", money(r.riskUsd)) +
        cell("calc_distance", price(r.distance) + " · " + r.stopPct.toFixed(2) + "%") +
        cell("calc_size", units(r.units) + " " + esc(t("calc_units"))) +
        cell("calc_value", money(r.value)) + '</div>' +
        '<span class="pill ' + r.side + '">' + esc(t(r.side === "long" ? "calc_side_long" : "calc_side_short")) + '</span>' + notes;
    }
    form.addEventListener("input", paint);
    form.addEventListener("submit", function(e){ e.preventDefault(); });
    paint();
  }

  // ---------- live Hypr boxes ----------
  function frame(body){
    return '<p class="sc-tag"><span class="hy-live">' + esc(t("hypr_tag")) + '</span></p>' + body +
      '<p class="disclaimer">' + esc(t("hypr_note")) + ' <a href="/#hypr">' + esc(t("hypr_all")) + ' →</a></p>';
  }
  function tile(label, value){ return '<div><small>' + esc(t(label)) + '</small><b class="num">' + esc(value) + '</b></div>'; }
  function resultPill(s){
    var r = s.result_r, text = r == null ? "" : " " + signed(r) + "R";
    if (s.status === "open") return '<span class="pill open">' + esc(t("status_open")) + '</span>';
    if (s.status === "sl") return '<span class="pill stopped">' + esc(t("status_sl")) + text + '</span>';
    if (s.status === "expired") return '<span class="pill ' + (r > 0 ? "hit" : r < 0 ? "stopped" : "expired") + '">' + esc(t("status_expired")) + text + '</span>';
    return '<span class="pill hit">' + esc(String(s.status).toUpperCase()) + text + '</span>';
  }
  function coin(s){
    var long = s.direction === "LONG";
    return '<span class="hy-coin"><b>' + esc(s.base || s.symbol) + '</b><span class="pill ' + (long ? "long" : "short") + '">' +
      esc(t(long ? "long" : "short")) + '</span><span class="pill tf">' + esc(s.tf) + '</span></span>';
  }

  var HYPR = {
    "hypr-record": function(d){
      var p = d.performance || {}, win = +p.win_rate || 0, avg = +p.avg_r || 0;
      var key = avg <= 0 ? "rec_neg" : win < WIN_RATE_HIGH ? "rec_pos" : "rec_pos_high";
      return '<div class="sc-tiles">' + tile("rec_closed", p.closed || 0) + tile("rec_win", win + "%") +
        tile("rec_pf", p.profit_factor || 0) + tile("rec_avg", signed(avg) + "R") + '</div>' +
        '<p>' + esc(t(key, {win: win, avg: signed(avg)})) + '</p>';
    },
    "hypr-losses": function(d){
      var closed = d.signals.filter(function(s){ return s.closed_at && s.result_r != null; });
      if (!closed.length) return '<p>' + esc(t("loss_none")) + '</p>';
      var losses = closed.filter(function(s){ return s.result_r < 0; }).length;
      var wins = closed.filter(function(s){ return s.result_r > 0; }).length;
      return '<p>' + esc(t("loss_summary", {n: closed.length, l: losses, w: wins})) + '</p><ul class="sc-rows">' +
        closed.slice(0, LOSS_ROWS).map(function(s){ return '<li>' + coin(s) + resultPill(s) + '</li>'; }).join("") + '</ul>' +
        '<p>' + esc(t("loss_lesson")) + '</p>';
    },
    "hypr-trade": function(d){
      var usable = d.signals.filter(function(s){ return s.entry > 0 && s.sl > 0 && s.tp1 > 0 && s.entry !== s.sl; });
      var s = usable.filter(function(x){ return x.base === "BTC"; })[0] || usable[0];
      if (!s) return '<p>' + esc(t("loss_none")) + '</p>';
      var risk = Math.abs(s.entry - s.sl), rr = function(tp){ return (Math.abs(tp - s.entry) / risk).toFixed(1); };
      var size = S.positionSize({account: DEMO_ACCOUNT, riskPct: DEMO_RISK_PCT, entry: s.entry, stop: s.sl});
      var line = function(label, value){ return '<li><span class="muted">' + esc(t(label)) + '</span><b class="num">' + esc(value) + '</b></li>'; };
      return '<div class="sc-trade-head">' + coin(s) + resultPill(s) + '</div><ul class="sc-rows">' +
        line("trade_entry", price(s.entry)) + line("trade_stop", price(s.sl)) +
        line("trade_distance", price(risk) + " · " + size.stopPct.toFixed(2) + "%") +
        line("trade_target1", price(s.tp1) + " · " + rr(s.tp1) + "R") +
        (s.tp3 > 0 ? line("trade_target3", price(s.tp3) + " · " + rr(s.tp3) + "R") : "") + '</ul>' +
        '<p><b>' + esc(t("trade_size")) + ':</b> ' + esc(t("trade_size_value", {units: units(size.units), base: s.base || s.symbol, value: money(size.value)})) + '</p>' +
        (s.tp3 > 0 ? '<p>' + esc(t("trade_lesson", {rr1: rr(s.tp1), rr3: rr(s.tp3)})) + '</p>' : "");
    }
  };

  function hyprWidgets(){
    var boxes = Array.prototype.filter.call(document.querySelectorAll(".sc-widget"), function(b){ return HYPR[b.getAttribute("data-widget")]; });
    if (!boxes.length) return;
    boxes.forEach(function(b){ b.classList.add("sc-hypr"); });
    fetch(API, {cache: "no-store"}).then(function(r){ return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function(d){
        if (!d || !Array.isArray(d.signals)) return Promise.reject("shape");
        boxes.forEach(function(b){ b.innerHTML = frame(HYPR[b.getAttribute("data-widget")](d)); });
      })
      .catch(function(){
        boxes.forEach(function(b){ b.innerHTML = '<p class="muted">' + esc(t("hypr_off")) + ' <a href="/#hypr">' + esc(t("hypr_all")) + ' →</a></p>'; });
      });
  }

  document.querySelectorAll('.sc-widget[data-widget="calc"]').forEach(calcWidget);
  hyprWidgets();
  paintProgress();
  openFromHash();
})();
