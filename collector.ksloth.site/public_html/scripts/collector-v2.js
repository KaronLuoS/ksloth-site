// collector-v2.js — Minimal Analytics Beacon from powell
(function() {
  'use strict';

  const endpoint = './scripts/log.php';

  function sendBeacon() {
    const payload = {
    url: window.location.href,
    title: document.title,
    referrer: document.referrer,
    timestamp: new Date().toISOString(),
    type: 'pageview',
    session: getSessionId(),
    technographics: getTechnographics()
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

function getTechnographics() {
  // Network info (feature-detected)
  let networkInfo = {};
  if ('connection' in navigator) {
    const conn = navigator.connection;
    networkInfo = {
      effectiveType: conn.effectiveType,
      downlink: conn.downlink,
      rtt: conn.rtt,
      saveData: conn.saveData
    };
  }

  return {
    // Browser identification
    userAgent: navigator.userAgent,
    language: navigator.language,
    cookiesEnabled: navigator.cookieEnabled,

    // Viewport (current browser window)
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,

    // Screen (physical display)
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    pixelRatio: window.devicePixelRatio,

    // Hardware
    cores: navigator.hardwareConcurrency || 0,
    memory: navigator.deviceMemory || 0,

    // Network
    network: networkInfo,

    // Preferences
    colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
}

// JavaScript enabled:
const javascriptEnabled = true;


// Image support:
function checkImageSupport() {
  return new Promise((resolve) => {
    const img = new Image();

    img.onload = function() {
      resolve(true);
    };

    img.onerror = function() {
      resolve(false);
    };

    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  });
}


// CSS support:
function checkCssSupport() {
  const test = document.createElement('div');

  test.style.cssText = 'position:absolute;';

  return test.style.position === 'absolute';
}