// Hypr AI signals on the home page: the live feed and real track record of the Hypr signal engine
// (https://t.me/HyprSignals), read from its public API. Every number shown comes from that API.
(function(){
  var API = "https://hypr.169-58-87-10.sslip.io/api/public/feed";
  var REFRESH_MS = 60000, SHOWN = 12;
  var box = document.getElementById("hypr");
  if (!box || !window.BT) return;
  var esc = BT.esc, onlyBtc = false, data = null;

  function price(v){
    if (v == null || isNaN(v)) return "—";
    var a = Math.abs(v), dp = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
    return "$" + Number(v).toLocaleString("en-US", {minimumFractionDigits: dp, maximumFractionDigits: dp});
  }
  function ago(ts){ return BT.ago(new Date(ts * 1000).toISOString()); }
  function result(s){
    var r = s.result_r, text = r == null ? "" : " " + (r > 0 ? "+" : "") + r.toFixed(2) + "R";
    if (s.status === "open") return '<span class="pill open">Open</span>';
    if (s.status === "sl") return '<span class="pill stopped">Stopped' + text + '</span>';
    if (s.status === "expired") return '<span class="pill ' + (r > 0 ? "hit" : r < 0 ? "stopped" : "expired") + '">Expired' + text + '</span>';
    return '<span class="pill hit">' + esc(String(s.status).toUpperCase()) + text + '</span>';
  }
  function row(s){
    var long = s.direction === "LONG";
    return '<li><span class="hy-coin"><b>' + esc(s.base || s.symbol) + '</b><span class="pill ' + (long ? "long" : "short") + '">' +
      (long ? "Long" : "Short") + '</span><span class="pill tf">' + esc(s.tf) + '</span></span>' +
      '<span class="hy-lv num"><em>Entry</em> ' + price(s.entry) + ' <em>Stop</em> ' + price(s.sl) + ' <em>Target</em> ' + price(s.tp1) + '</span>' +
      '<span class="hy-res">' + result(s) + '<small class="muted">' + ago(s.ts) + '</small></span></li>';
  }
  function tile(label, value){ return '<div><small>' + label + '</small><b class="num">' + value + '</b></div>'; }

  function render(){
    if (!data) return;
    var p = data.performance || {}, rows = data.signals.filter(function(s){ return !onlyBtc || s.base === "BTC"; });
    box.innerHTML =
      '<div class="hy-head"><div><h2>AI signals <span class="hy-live">live</span></h2>' +
      '<p class="muted">From the Hypr signal engine. Every signal is tracked to its stop or target — the numbers below are its real record, losses included.</p></div>' +
      '<a class="btn ghost sm" href="' + esc(data.channel) + '" target="_blank" rel="noopener">Get them on Telegram →</a></div>' +
      '<div class="hy-tiles">' + tile("Closed signals", p.closed || 0) + tile("Win rate", (p.win_rate || 0) + "%") +
      tile("Profit factor", p.profit_factor || 0) + tile("Average result", ((p.avg_r || 0) > 0 ? "+" : "") + (p.avg_r || 0) + "R") + '</div>' +
      '<div class="tabs hy-tabs"><button data-b="0"' + (onlyBtc ? "" : ' class="on"') + '>All coins</button><button data-b="1"' +
      (onlyBtc ? ' class="on"' : "") + '>BTC only</button></div>' +
      (rows.length ? '<ul class="hy-list">' + rows.slice(0, SHOWN).map(row).join("") + '</ul>'
                   : '<div class="empty">No ' + (onlyBtc ? "BTC " : "") + 'signals in the latest batch.</div>') +
      '<p class="disclaimer">R = result measured in units of the risk taken (stop distance). Automated signals, not financial advice.</p>';
  }
  function load(){
    fetch(API, {cache: "no-store"}).then(function(r){ return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function(d){ if (d && Array.isArray(d.signals)){ data = d; render(); } })
      .catch(function(){ if (!data) box.innerHTML = '<div class="empty">AI signals are unavailable right now.</div>'; });
  }
  box.addEventListener("click", function(e){
    var b = e.target.closest(".hy-tabs button"); if (!b) return;
    onlyBtc = b.getAttribute("data-b") === "1"; render();
  });
  load();
  setInterval(function(){ if (!document.hidden) load(); }, REFRESH_MS);
})();
