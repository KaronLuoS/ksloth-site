/**
 * collector-v4.js — Analytics Collector with Performance Timing
 * CSE 135 - Module 05: Performance Timing
 *
 * Extends previous collectors with:
 *   - getNavigationTiming(): DNS, TCP, TLS, TTFB, DOM milestones
 *   - getResourceSummary(): resource counts, sizes, durations by type
 *   - Timing collection after load event with setTimeout delay
 *
 * Carries forward from v2/v3:
 *   - getSessionId(): session identity via sessionStorage
 *   - getTechnographics(): browser, device, screen, network, preferences
 *
 * Usage: Include this script in any HTML page.
 *        Open the browser console to see collected data.
 */

(function () {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────────
  const ENDPOINT = './scripts/log.php';  // Replace with your endpoint

  // ── Utility ────────────────────────────────────────────────────────

  /**
   * Round a number to two decimal places.
   */
  function round(n) {
    return Math.round(n * 100) / 100;
  }

  // ── Session Identity ───────────────────────────────────────────────

  /**
   * Generate or retrieve a session ID from sessionStorage.
   * Persists across page navigations within the same tab.
   * Clears automatically when the tab or browser closes.
   */
  function getSessionId() {
    let sid = sessionStorage.getItem('_collector_sid');
    if (!sid) {
      sid = Math.random().toString(36).substring(2) + Date.now().toString(36);
      sessionStorage.setItem('_collector_sid', sid);
    }
    return sid;
  }

  // ── Network Information ────────────────────────────────────────────

  /**
   * Collect network connection data via the Network Information API.
   * Returns an empty object if the API is unavailable.
   */
  function getNetworkInfo() {
    if (!('connection' in navigator)) return {};

    const conn = navigator.connection;
    return {
      effectiveType: conn.effectiveType,
      downlink: conn.downlink,
      rtt: conn.rtt,
      saveData: conn.saveData
    };
  }

  // ── Technographics ─────────────────────────────────────────────────

  /**
   * Collect a complete technographic profile of the user's environment.
   */
  function getTechnographics() {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      pixelRatio: window.devicePixelRatio,
      cores: navigator.hardwareConcurrency || 0,
      memory: navigator.deviceMemory || 0,
      network: getNetworkInfo(),
      colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark' : 'light',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  // ── Navigation Timing ──────────────────────────────────────────────

  /**
   * Extract key performance milestones from the Navigation Timing API.
   * Returns an object with durations in milliseconds, or an empty
   * object if the API is unavailable.
   */
  function getNavigationTiming() {
    const entries = performance.getEntriesByType('navigation');
    if (!entries.length) return {};

    const n = entries[0];

    return {
      // DNS lookup time
      dnsLookup: round(n.domainLookupEnd - n.domainLookupStart),
      // TCP connection time
      tcpConnect: round(n.connectEnd - n.connectStart),
      // TLS handshake (HTTPS only)
      tlsHandshake: n.secureConnectionStart > 0
        ? round(n.connectEnd - n.secureConnectionStart) : 0,
      // Time to First Byte
      ttfb: round(n.responseStart - n.requestStart),
      // Download time (response body)
      download: round(n.responseEnd - n.responseStart),
      // DOM interactive (HTML parsed, subresources may still load)
      domInteractive: round(n.domInteractive - n.fetchStart),
      // DOM complete (all resources loaded)
      domComplete: round(n.domComplete - n.fetchStart),
      // Full page load (through load event)
      loadEvent: round(n.loadEventEnd - n.fetchStart),
      // Total fetch time (request + response)
      fetchTime: round(n.responseEnd - n.fetchStart),
      // Transfer size and header overhead
      transferSize: n.transferSize,
      headerSize: n.transferSize - n.encodedBodySize
    };
  }

  // ── Resource Timing ────────────────────────────────────────────────

  /**
   * Aggregate resource timing data by initiator type.
   * Returns total resource count and per-type breakdown of
   * count, totalSize (bytes), and totalDuration (ms).
   */
  function getResourceSummary() {
    const resources = performance.getEntriesByType('resource');

    const summary = {
      script:         { count: 0, totalSize: 0, totalDuration: 0 },
      link:           { count: 0, totalSize: 0, totalDuration: 0 },
      img:            { count: 0, totalSize: 0, totalDuration: 0 },
      font:           { count: 0, totalSize: 0, totalDuration: 0 },
      fetch:          { count: 0, totalSize: 0, totalDuration: 0 },
      xmlhttprequest: { count: 0, totalSize: 0, totalDuration: 0 },
      other:          { count: 0, totalSize: 0, totalDuration: 0 }
    };

    resources.forEach((r) => {
      const type = summary[r.initiatorType] ? r.initiatorType : 'other';
      summary[type].count++;
      summary[type].totalSize += r.transferSize || 0;
      summary[type].totalDuration += r.duration || 0;
    });

    return {
      totalResources: resources.length,
      byType: summary
    };
  }

  // ── Payload Delivery ───────────────────────────────────────────────

  /**
   * Send the payload to the analytics endpoint via sendBeacon,
   * falling back to fetch with keepalive.
   */
  function send(payload) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, blob);
      console.log('[collector-v4] Beacon sent');
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        body: blob,
        keepalive: true
      }).catch((err) => {
        console.warn('[collector-v4] fetch fallback error:', err.message);
      });
    }

    console.log('[collector-v4] payload:', payload);
  }

  // ── Collect & Send ─────────────────────────────────────────────────

  /**
   * Build the full analytics payload and send it.
   * Includes page data, session, technographics, and performance timing.
   */
  function collect() {
    const payload = {
      url: window.location.href,
      title: document.title,
      referrer: document.referrer,
      timestamp: new Date().toISOString(),
      type: 'pageview',
      session: getSessionId(),
      technographics: getTechnographics(),
      timing: getNavigationTiming(),
      resources: getResourceSummary()
    };

    send(payload);

    // Dispatch a custom event so test pages can read the payload
    window.dispatchEvent(new CustomEvent('collector:payload', { detail: payload }));
  }

  // ── Triggers ───────────────────────────────────────────────────────

  // Collect after the page is fully loaded, with a setTimeout delay
  // to ensure loadEventEnd is populated.
  window.addEventListener('load', () => {
    setTimeout(() => {
      console.log('[collector-v4] Page loaded — collecting performance timing');
      collect();
    }, 0);
  });

  // Collect again when the page is being hidden (tab close, navigation away)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      console.log('[collector-v4] Page hidden — sending exit beacon');
      collect();
    }
  });

  // ── Expose for test page ───────────────────────────────────────────

  window.__collector = {
    getNavigationTiming: getNavigationTiming,
    getResourceSummary: getResourceSummary,
    getTechnographics: getTechnographics,
    getSessionId: getSessionId,
    getNetworkInfo: getNetworkInfo,
    collect: collect
  };

})();
