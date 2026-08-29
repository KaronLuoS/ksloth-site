// collector-v2.js — Enhanced Analytics Beacon
(function () {
  'use strict';

  const endpoint = './scripts/log.php';

  function checkCssAllowed() {
    try {
      const testEl = document.createElement('div');
      testEl.style.height = '12px';
      testEl.style.display = 'none';
      document.body ? document.body.appendChild(testEl) : document.documentElement.appendChild(testEl);
      const computed = window.getComputedStyle(testEl).height === '12px';
      testEl.remove();
      return computed;
    } catch (e) {
      return false;
    }
  }

  function checkImagesAllowed() {
    try {
      const img = new Image();
      // 1x1 transparent GIF base64
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      return img.complete && img.naturalWidth > 0;
    } catch (e) {
      return false;
    }
  }

  function getTechnographics() {
    // 1. Network info
    let networkConnection = 'unknown';
    let networkDetails = {};
    if ('connection' in navigator) {
      const conn = navigator.connection;
      networkConnection = conn.effectiveType || conn.type || 'unknown';
      networkDetails = {
        effectiveType: conn.effectiveType,
        downlink: conn.downlink,
        rtt: conn.rtt,
        saveData: conn.saveData
      };
    }

    return {
      // Identity & Capabilities
      userAgent: navigator.userAgent,
      language: navigator.language || navigator.userLanguage,
      cookiesEnabled: navigator.cookieEnabled,
      jsAllowed: true, // If this script executes, JS is active
      cssAllowed: checkCssAllowed(),
      imagesAllowed: checkImagesAllowed(),

      // Viewport / Window Dimensions
      windowWidth: window.innerWidth || document.documentElement.clientWidth,
      windowHeight: window.innerHeight || document.documentElement.clientHeight,

      // Screen Dimensions
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      pixelRatio: window.devicePixelRatio || 1,

      // Network Connection
      networkConnection: networkConnection,
      network: networkDetails,

      // Hardware & System Preferences
      cores: navigator.hardwareConcurrency || 0,
      memory: navigator.deviceMemory || 0,
      colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  function sendBeacon() {
    const payload = {
      url: window.location.href,
      title: document.title,
      referrer: document.referrer,
      timestamp: new Date().toISOString(),
      type: 'pageview',
      session: typeof getSessionId === 'function' ? getSessionId() : 'anonymous',
      technographics: getTechnographics()
    };

    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, blob);
    } else {
      fetch(endpoint, {
        method: 'POST',
        body: blob,
        keepalive: true
      });
    }
  }

  // Fire on complete load so DOM dimensions and computed styles resolve accurately
  if (document.readyState === 'complete') {
    sendBeacon();
  } else {
    window.addEventListener('load', sendBeacon);
  }
})();