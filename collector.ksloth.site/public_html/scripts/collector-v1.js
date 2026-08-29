// collector-v1.js — Minimal Analytics Beacon from powell
(function() {
  'use strict';

  const endpoint = './scripts/log.php';

  function sendBeacon() {
    const payload = {
      url: window.location.href,
      title: document.title,
      referrer: document.referrer,
      timestamp: new Date().toISOString(),
      type: 'pageview'
    };

    const blob = new Blob(
      [JSON.stringify(payload)],
      { type: 'application/json' }
    );

    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, blob);
    } else {
      // Fallback for older browsers
      fetch(endpoint, {
        method: 'POST',
        body: blob,
        keepalive: true
      });
    }
  }

  // Fire on page load
  if (document.readyState === 'complete') {
    sendBeacon();
  } else {
    window.addEventListener('load', sendBeacon);
  }
})();