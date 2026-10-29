/* pwa-shim.js — يحاكي google.script.run ويوجّه الاستدعاءات إلى Apps Script عبر fetch.
   لا يلزم تعديل أي استدعاء في الكود الحالي (47 موضع). */
(function () {
  'use strict';
  var API_URL = 'https://script.google.com/macros/s/AKfycbxlZTDCZmGhO6BQa-aTSvV28YKMTjwby1w_j5F6oNDXI3ji6d7pWvUwa3VFrVZZC9Q7Jw/exec';   // رابط النشر المنتهي بـ /exec
  var TIMEOUT_MS = 60000;
  var READ_RE = /^(get|list|verify|generate)/;   // قراءات فقط: يُسمح بإعادة المحاولة

  function post(fn, args) {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, TIMEOUT_MS);
    return fetch(API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // يتجنب preflight
      body: JSON.stringify({ fn: fn, args: args }),
      signal: ctl.signal
    }).then(function (res) {
      return res.text();
    }).then(function (txt) {
      var j;
      try { j = JSON.parse(txt); } catch (e) { throw new Error('رد غير صالح من الخادم (تحقق من إعداد النشر: Anyone)'); }
      if (!j.ok) throw new Error(j.error || 'خطأ في الخادم');
      return j.data;
    }).finally(function () { clearTimeout(t); });
  }

  function call(fn, args) {
    // الكتابة لا تُعاد تلقائيًا أبدًا (منعًا لتكرار السجلات)
    if (!READ_RE.test(fn)) return post(fn, args);
    return post(fn, args).catch(function (e) {
      if (e && e.name === 'AbortError') throw e;
      return new Promise(function (r) { setTimeout(r, 800); }).then(function () { return post(fn, args); });
    });
  }

  function runner(ok, fail, user) {
    return new Proxy({}, {
      get: function (_, prop) {
        if (typeof prop === 'symbol' || prop === 'then') return undefined;
        if (prop === 'withSuccessHandler') return function (f) { return runner(f, fail, user); };
        if (prop === 'withFailureHandler') return function (f) { return runner(ok, f, user); };
        if (prop === 'withUserObject') return function (o) { return runner(ok, fail, o); };
        return function () {
          var args = Array.prototype.slice.call(arguments);
          call(String(prop), args).then(function (r) {
            if (ok) ok(r, user);
          }, function (e) {
            if (fail) fail(e && e.name === 'AbortError' ? new Error('انتهت مهلة الاتصال') : e, user);
            else console.error('[run]', prop, e);
          });
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = {
    run: runner(null, null, undefined),
    host: { close: function () {}, setHeight: function () {}, setWidth: function () {}, origin: location.origin },
    history: { push: function () {}, replace: function () {}, setChangeHandler: function () {} },
    url: { getLocation: function (cb) { cb && cb({ hash: location.hash.slice(1), parameter: {}, parameters: {} }); } }
  };
})();
