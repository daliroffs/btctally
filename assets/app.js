// BTC Tally — shared app code (header, auth, posting, signal cards, voting)
(function(){
  var cfg = window.BT_CONFIG || {};
  var configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  var sb = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  var BT = window.BT = {
    sb: sb, configured: configured,
    user: null, profile: null, price: null,
    myVotes: {}, listeners: []
  };

  // ---------- helpers ----------
  BT.esc = function(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); };
  BT.usd = function(v, dp){
    if (v == null || isNaN(v)) return "—";
    return "$" + Number(v).toLocaleString("en-US", {minimumFractionDigits: dp == null ? 0 : dp, maximumFractionDigits: dp == null ? 0 : dp});
  };
  BT.pct = function(v, sign){ if (v == null || isNaN(v)) return "—"; return (sign && v > 0 ? "+" : "") + v.toFixed(2) + "%"; };
  BT.ago = function(iso){
    var s = Math.max(1, (Date.now() - new Date(iso)) / 1000);
    if (s < 60) return Math.floor(s) + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    if (s < 86400 * 30) return Math.floor(s / 86400) + "d ago";
    return new Date(iso).toLocaleDateString(undefined, {year:"numeric", month:"short", day:"numeric"});
  };
  BT.until = function(iso){
    var s = (new Date(iso) - Date.now()) / 1000;
    if (s <= 0) return "expiring";
    if (s < 3600) return Math.ceil(s / 60) + "m left";
    if (s < 86400) return Math.floor(s / 3600) + "h left";
    return Math.floor(s / 86400) + "d left";
  };
  BT.qs = function(k){ return new URLSearchParams(location.search).get(k); };
  BT.toast = function(msg){
    var t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t); setTimeout(function(){ t.remove(); }, 3200);
  };
  BT.errMsg = function(e){
    var m = (e && (e.message || e.error_description)) || String(e);
    return m.replace(/^.*?ERROR:\s*/, "");
  };
  // % move and reward:risk for a signal
  BT.levels = function(s){
    var e = +s.entry, t = +s.target, st = +s.stop;
    var tp = (t - e) / e * 100, sp = (st - e) / e * 100;
    return {tp: tp, sp: sp, rr: Math.abs(tp / sp)};
  };
  BT.result = function(s){
    if (s.status === "open" || s.closed_price == null) return null;
    var e = +s.entry, c = +s.closed_price;
    return s.direction === "long" ? (c - e) / e * 100 : (e - c) / e * 100;
  };
  BT.onAuth = function(fn){ BT.listeners.push(fn); };

  // ---------- header / footer ----------
  var NAV = [["/", "Signals"], ["/leaderboard/", "Leaderboard"], ["/rules/", "Rules"]];
  BT.initPage = function(active){
    var h = document.createElement("header"); h.className = "site";
    h.innerHTML = '<div class="wrap">' +
      '<a class="brand" href="/"><img src="/assets/logo.svg" alt="" width="28" height="28">BTC Tally</a>' +
      '<nav class="main">' + NAV.map(function(n){ return '<a href="' + n[0] + '"' + (n[0] === active ? ' class="on"' : "") + '>' + n[1] + '</a>'; }).join("") + '</nav>' +
      '<div class="ticker" title="BTC-USD (Coinbase)"><small class="muted">BTC</small><b id="bt-px">—</b><small id="bt-chg"></small></div>' +
      '<div class="authbox" id="bt-auth"></div></div>';
    document.body.prepend(h);

    var f = document.createElement("footer"); f.className = "site";
    f.innerHTML = '<div class="wrap"><span>© 2026 BTC Tally · Signals are community opinions, not financial advice.</span>' +
      '<span><a href="/rules/">Rules</a> · <a href="/privacy/">Privacy</a></span></div>';
    document.body.appendChild(f);

    startTicker();
    renderAuth();
    if (!configured) return;
    sb.auth.onAuthStateChange(function(_ev, session){ setUser(session ? session.user : null); });
    sb.auth.getSession().then(function(r){ setUser(r.data.session ? r.data.session.user : null); });
  };

  function startTicker(){
    function tick(){
      fetch("https://api.exchange.coinbase.com/products/BTC-USD/stats").then(function(r){ return r.json(); }).then(function(d){
        var last = +d.last, open = +d.open, chg = (last - open) / open * 100;
        BT.price = last;
        document.getElementById("bt-px").textContent = BT.usd(last);
        var c = document.getElementById("bt-chg");
        c.textContent = BT.pct(chg, true); c.className = chg >= 0 ? "up" : "down";
        document.dispatchEvent(new CustomEvent("bt:price", {detail: last}));
      }).catch(function(){});
    }
    tick(); setInterval(tick, 15000);
  }

  function setUser(u){
    var changed = (u && u.id) !== (BT.user && BT.user.id);
    BT.user = u;
    if (!u){ BT.profile = null; BT.myVotes = {}; renderAuth(); if (changed) BT.listeners.forEach(function(fn){ fn(); }); return; }
    if (!changed) return;
    Promise.all([
      sb.from("profiles").select("*").eq("id", u.id).maybeSingle(),
      sb.from("votes").select("signal_id,value").eq("user_id", u.id)
    ]).then(function(r){
      BT.profile = r[0].data;
      BT.myVotes = {}; (r[1].data || []).forEach(function(v){ BT.myVotes[v.signal_id] = v.value; });
      renderAuth();
      BT.listeners.forEach(function(fn){ fn(); });
      if (BT.profile && /^trader_/.test(BT.profile.username) && !sessionStorageGet("bt:skipname")) openUsername();
    });
  }
  function sessionStorageGet(k){ try { return sessionStorage.getItem(k); } catch(e){ return null; } }
  function sessionStorageSet(k, v){ try { sessionStorage.setItem(k, v); } catch(e){} }

  function renderAuth(){
    var box = document.getElementById("bt-auth"); if (!box) return;
    if (BT.user && BT.profile){
      box.innerHTML = (BT.profile.is_admin ? '<a class="userlink" href="/mod/" title="Moderation">🛡 Mod</a>' : '') +
        '<button class="btn sm" id="bt-post">+ Post signal</button>' +
        '<a class="userlink" href="/trader/?u=' + encodeURIComponent(BT.profile.username) + '">' + BT.esc(BT.profile.username) + '</a>' +
        '<button class="btn ghost sm" id="bt-out">Sign out</button>';
      box.querySelector("#bt-post").onclick = BT.openPost;
      box.querySelector("#bt-out").onclick = function(){ sb.auth.signOut(); };
    } else {
      box.innerHTML = '<button class="btn ghost sm" id="bt-in">Sign in</button><button class="btn sm" id="bt-post">+ Post signal</button>';
      box.querySelector("#bt-in").onclick = BT.openAuth;
      box.querySelector("#bt-post").onclick = BT.openAuth;
    }
  }

  // ---------- dialogs ----------
  function dialog(html){
    var d = document.createElement("dialog");
    d.innerHTML = '<div class="dlg" style="position:relative"><button class="x" aria-label="Close">×</button>' + html + '</div>';
    document.body.appendChild(d);
    d.querySelector(".x").onclick = function(){ d.close(); };
    d.addEventListener("close", function(){ d.remove(); });
    d.addEventListener("click", function(e){ if (e.target === d) d.close(); });
    d.showModal();
    return d;
  }
  BT.requireAuth = function(){ if (BT.user) return true; BT.openAuth(); return false; };

  var PROVIDER_NAMES = {github: "GitHub", google: "Google", discord: "Discord", twitter: "X (Twitter)"};
  BT.openAuth = function(){
    if (!configured) return BT.toast("Accounts are being set up. Check back soon.");
    var prov = (cfg.authProviders || []);
    var d = dialog('<h2>Join BTC Tally</h2><p class="sub">Post signals, vote and build a verified track record.</p>' +
      '<div class="oauth">' + prov.map(function(p){ return '<button class="btn ghost block" data-p="' + p + '">Continue with ' + (PROVIDER_NAMES[p] || p) + '</button>'; }).join("") + '</div>' +
      (cfg.emailLinks ? '<label class="f">Or get a sign-in link by email</label><form id="bt-mail" style="display:flex;gap:8px"><input class="in" type="email" required placeholder="you@example.com"><button class="btn">Send</button></form>' : "") +
      '<p class="err" id="bt-aerr"></p><p class="disclaimer">By joining you agree to the <a href="/rules/">community rules</a>.</p>');
    d.querySelectorAll("[data-p]").forEach(function(b){
      b.onclick = function(){
        sb.auth.signInWithOAuth({provider: b.getAttribute("data-p"), options: {redirectTo: location.href}})
          .then(function(r){ if (r.error) d.querySelector("#bt-aerr").textContent = BT.errMsg(r.error); });
      };
    });
    var mf = d.querySelector("#bt-mail");
    if (mf) mf.onsubmit = function(e){
      e.preventDefault();
      sb.auth.signInWithOtp({email: mf.querySelector("input").value, options: {emailRedirectTo: location.href}}).then(function(r){
        d.querySelector("#bt-aerr").textContent = r.error ? BT.errMsg(r.error) : "";
        if (!r.error) mf.outerHTML = '<p>Check your inbox for the sign-in link.</p>';
      });
    };
  };

  function openUsername(){
    var d = dialog('<h2>Pick your trader name</h2><p class="sub">This is how other traders will see you. 3–20 letters, numbers or _.</p>' +
      '<form id="bt-un"><input class="in" name="u" maxlength="20" pattern="[A-Za-z0-9_]{3,20}" required value="' + BT.esc(BT.profile.username) + '">' +
      '<label class="f">Short bio (optional)</label><input class="in" name="b" maxlength="280" placeholder="e.g. Swing trader, price action, 6 years">' +
      '<p class="err" id="bt-uerr"></p><button class="btn block">Save</button></form>');
    d.addEventListener("close", function(){ sessionStorageSet("bt:skipname", "1"); });
    var f = d.querySelector("#bt-un");
    f.onsubmit = function(e){
      e.preventDefault();
      sb.from("profiles").update({username: f.u.value.trim(), bio: f.b.value.trim()}).eq("id", BT.user.id).select().single().then(function(r){
        if (r.error) return d.querySelector("#bt-uerr").textContent = /duplicate|unique/i.test(r.error.message) ? "That name is taken." : BT.errMsg(r.error);
        BT.profile = r.data; renderAuth(); d.close(); BT.toast("Welcome, " + r.data.username + "!");
      });
    };
  }

  BT.openPost = function(){
    if (!BT.requireAuth()) return;
    var st = {dir: "long", tf: "4h"};
    var d = dialog('<h2>Post a BTC signal</h2><p class="sub">Your entry is locked at the live price when you post. Signals can\'t be edited, and every result counts toward your public track record.</p>' +
      '<form id="bt-pf" autocomplete="off">' +
      '<div class="seg" id="bt-dir"><button type="button" data-v="long" class="on">▲ Long</button><button type="button" data-v="short">▼ Short</button></div>' +
      '<label class="f">Timeframe</label><div class="seg seg4" id="bt-tf"><button type="button" data-v="1h">1H</button><button type="button" data-v="4h" class="on">4H</button><button type="button" data-v="1d">1D</button><button type="button" data-v="1w">1W</button></div>' +
      '<div class="row2"><div><label class="f">Target ($)</label><input class="in num" name="target" type="number" step="0.01" min="0" required></div>' +
      '<div><label class="f">Stop-loss ($)</label><input class="in num" name="stop" type="number" step="0.01" min="0" required></div></div>' +
      '<div class="preview" id="bt-prev">Live price: <b>' + BT.usd(BT.price, 2) + '</b></div>' +
      '<label class="f">Title</label><input class="in" name="title" maxlength="120" required placeholder="e.g. Breakout retest of $84k support">' +
      '<label class="f">Analysis</label><textarea class="in" name="body" maxlength="5000" placeholder="Why this trade? Levels, indicators, invalidation…"></textarea>' +
      '<p class="err" id="bt-perr"></p><button class="btn block" id="bt-psub">Post signal</button>' +
      '<p class="disclaimer">Expires after 1 day (1H), 3 days (4H), 14 days (1D) or 60 days (1W) if neither level is hit.</p></form>');
    var f = d.querySelector("#bt-pf");
    function seg(id, key){
      d.querySelectorAll("#" + id + " button").forEach(function(b){
        b.onclick = function(){ st[key] = b.getAttribute("data-v"); d.querySelectorAll("#" + id + " button").forEach(function(x){ x.classList.toggle("on", x === b); }); preview(); };
      });
    }
    seg("bt-dir", "dir"); seg("bt-tf", "tf");
    function preview(){
      var p = BT.price, t = parseFloat(f.target.value), s = parseFloat(f.stop.value), out = "Live price: <b>" + BT.usd(p, 2) + "</b>";
      if (p && t && s){
        var tp = (t - p) / p * 100, sp = (s - p) / p * 100;
        var ok = st.dir === "long" ? (s < p && p < t) : (t < p && p < s);
        out += ' · Target <span class="' + (tp >= 0 ? "up" : "down") + '">' + BT.pct(tp, true) + '</span> · Stop <span class="' + (sp >= 0 ? "up" : "down") + '">' + BT.pct(sp, true) + '</span>';
        out += ok ? ' · R:R <b>' + Math.abs(tp / sp).toFixed(2) + '</b>' : '<br><span class="down">' + (st.dir === "long" ? "Long: stop below price, target above." : "Short: target below price, stop above.") + '</span>';
      }
      d.querySelector("#bt-prev").innerHTML = out;
    }
    f.target.oninput = f.stop.oninput = preview;
    var onPx = function(){ preview(); }; document.addEventListener("bt:price", onPx);
    d.addEventListener("close", function(){ document.removeEventListener("bt:price", onPx); });
    f.onsubmit = function(e){
      e.preventDefault();
      var btn = d.querySelector("#bt-psub"); btn.disabled = true; btn.textContent = "Posting…";
      sb.rpc("post_signal", {p_direction: st.dir, p_timeframe: st.tf, p_target: parseFloat(f.target.value), p_stop: parseFloat(f.stop.value), p_title: f.title.value.trim(), p_body: f.body.value.trim()})
        .then(function(r){
          if (r.error){ d.querySelector("#bt-perr").textContent = BT.errMsg(r.error); btn.disabled = false; btn.textContent = "Post signal"; return; }
          d.close(); location.href = "/signal/?id=" + r.data.id;
        });
    };
  };

  BT.report = function(target){
    if (!BT.requireAuth()) return;
    var d = dialog('<h2>Report</h2><p class="sub">Spam, scams, pump groups, abuse or anything against the rules.</p><form id="bt-rf"><textarea class="in" name="r" maxlength="500" required minlength="3" placeholder="What\'s wrong?"></textarea><p class="err" id="bt-rerr"></p><button class="btn block">Send report</button></form>');
    var f = d.querySelector("#bt-rf");
    f.onsubmit = function(e){
      e.preventDefault();
      var row = Object.assign({reporter: BT.user.id, reason: f.r.value.trim()}, target);
      sb.from("reports").insert(row).then(function(r){
        if (r.error) return d.querySelector("#bt-rerr").textContent = BT.errMsg(r.error);
        d.close(); BT.toast("Thanks, a moderator will review it.");
      });
    };
  };

  // ---------- signal cards ----------
  BT.statusPill = function(s){
    var label = {open: "Open", hit: "Target hit", stopped: "Stopped out", expired: "Expired"}[s.status];
    var res = BT.result(s);
    return '<span class="pill ' + s.status + '">' + label + (res != null ? " " + BT.pct(res, true) : "") + '</span>';
  };
  BT.authorBadge = function(s){
    return s.author_closed > 0 && s.author_win_rate != null
      ? '<span class="wr" title="Win rate over ' + s.author_closed + ' closed signals">' + Math.round(s.author_win_rate) + '% win · ' + s.author_closed + '</span>'
      : '<span class="muted">new trader</span>';
  };
  BT.signalCard = function(s){
    var L = BT.levels(s), my = BT.myVotes[s.id] || 0;
    var el = document.createElement("article"); el.className = "sig";
    el.innerHTML =
      '<div class="vote"><button class="upv' + (my === 1 ? " on" : "") + '" aria-label="Upvote">▲</button><span class="score">' + s.score + '</span><button class="dnv' + (my === -1 ? " on" : "") + '" aria-label="Downvote">▼</button></div>' +
      '<div><div class="top"><span class="pill ' + s.direction + '">' + (s.direction === "long" ? "▲ Long" : "▼ Short") + '</span><span class="pill tf">' + s.timeframe.toUpperCase() + '</span>' + BT.statusPill(s) +
        '<span>by <a href="/trader/?u=' + encodeURIComponent(s.username) + '">' + BT.esc(s.username) + '</a></span>' + BT.authorBadge(s) + '<span>· ' + BT.ago(s.created_at) + '</span></div>' +
      '<h4><a href="/signal/?id=' + s.id + '">' + BT.esc(s.title) + '</a></h4>' +
      '<div class="levels"><span><em>Entry</em>' + BT.usd(s.entry) + '</span><span><em>Target</em>' + BT.usd(s.target) + ' <small class="' + (L.tp >= 0 ? "up" : "down") + '">' + BT.pct(L.tp, true) + '</small></span>' +
        '<span><em>Stop</em>' + BT.usd(s.stop) + ' <small class="' + (L.sp >= 0 ? "up" : "down") + '">' + BT.pct(L.sp, true) + '</small></span><span><em>R:R</em>' + L.rr.toFixed(2) + '</span></div>' +
      '<div class="meta"><a href="/signal/?id=' + s.id + '#comments">💬 ' + s.comment_count + ' comments</a>' + (s.status === "open" ? '<span>⏱ ' + BT.until(s.expires_at) + '</span>' : "") + '</div></div>';
    BT.bindVotes(el, s);
    return el;
  };
  BT.bindVotes = function(el, s){
    var up = el.querySelector(".upv"), dn = el.querySelector(".dnv"), sc = el.querySelector(".score");
    function cast(v){
      if (!BT.requireAuth()) return;
      var prev = BT.myVotes[s.id] || 0, next = prev === v ? 0 : v;
      BT.myVotes[s.id] = next; s.score += next - prev;
      sc.textContent = s.score; up.classList.toggle("on", next === 1); dn.classList.toggle("on", next === -1);
      var q = next === 0
        ? sb.from("votes").delete().eq("user_id", BT.user.id).eq("signal_id", s.id)
        : sb.from("votes").upsert({user_id: BT.user.id, signal_id: s.id, value: next});
      q.then(function(r){
        if (r.error){ BT.myVotes[s.id] = prev; s.score -= next - prev; sc.textContent = s.score; up.classList.toggle("on", prev === 1); dn.classList.toggle("on", prev === -1); BT.toast(BT.errMsg(r.error)); }
      });
    }
    up.onclick = function(){ cast(1); }; dn.onclick = function(){ cast(-1); };
  };

  BT.setupNotice = function(el){
    el.innerHTML = '<div class="empty">The community is being set up. Signals will appear here soon.</div>';
  };
})();
