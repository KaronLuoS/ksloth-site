/**
 * collector-v7.js — IIFE-based Collector with Configuration API
 * CSE 135 - Module 08: Configuration API
 *
 * Transforms the collector from a script that runs automatically into
 * a configurable library with a public API.
 *
 * Public API:
 *   collector.init(options)        — Configure and start the collector
 *   collector.track(event, data)   — Send a custom event
 *   collector.set(key, value)      — Attach a property to every future beacon
 *   collector.identify(userId)     — Link the session to an authenticated user
 *
 * All previous functionality (v1-v6) is included but gated by config flags:
 *   - Session management (always on)
 *   - Technographics (enableTechnographics)
 *   - Navigation/Resource timing (enableTiming)
 *   - Web Vitals observers (enableVitals)
 *   - Error tracking (enableErrors)
 *   - Sampling (sampleRate)
 *   - Debug mode (debug)
 */

const collector = (function() {
  'use strict';

  // ── Private State ─────────────────────────────────────────────────

  let config = {};
  let initialized = false;
  const globalProps = {};
  const beaconLog = [];       // Track sent beacons (for test page)
  const vitalsData = {};      // Accumulated Web Vitals

  // ── Default Configuration ─────────────────────────────────────────

  const defaults = {
    endpoint: '/collect',
    enableTechnographics: true,
    enableTiming: true,
    enableVitals: true,
    enableErrors: true,
    sampleRate: 1.0,        // 1.0 = 100% of sessions
    debug: false             // true = log to console instead of sending
  };

  // ── Logging ───────────────────────────────────────────────────────

  /**
   * Log a message to the console (only when debug mode is on).
   */
  function log(...args) {
    if (config.debug) {
      console.log('[Collector]', ...args);
    }
  }

  /**
   * Log a warning to the console (always, regardless of debug mode).
   */
  function warn(...args) {
    console.warn('[Collector]', ...args);
  }

  // ── Utility ───────────────────────────────────────────────────────

  /**
   * Round a number to two decimal places.
   */
  function round(n) {
    return Math.round(n * 100) / 100;
  }

  // ── Session Identity ──────────────────────────────────────────────

  /**
   * Generate or retrieve a session ID from sessionStorage.
   * Persists across page navigations within the same tab.
   */
  function getSessionId() {
    let sid = sessionStorage.getItem('_collector_sid');
    if (!sid) {
      sid = Math.random().toString(36).substring(2) + Date.now().toString(36);
      sessionStorage.setItem('_collector_sid', sid);
    }
    return sid;
  }

  // ── Sampling ──────────────────────────────────────────────────────

  /**
   * Decide whether this session should be sampled.
   * The decision is made once per session and stored in sessionStorage.
   */
  function shouldSample() {
    const sampled = sessionStorage.getItem('_collector_sampled');
    if (sampled !== null) return sampled === 'true';

    const result = Math.random() < config.sampleRate;
    sessionStorage.setItem('_collector_sampled', String(result));
    return result;
  }

  // ── Network Information ───────────────────────────────────────────

  /**
   * Collect network connection data via the Network Information API.
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

  // ── Technographics ────────────────────────────────────────────────

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

  // ── Navigation Timing ─────────────────────────────────────────────

  /**
   * Extract key performance milestones from the Navigation Timing API.
   */
  function getNavigationTiming() {
    const entries = performance.getEntriesByType('navigation');
    if (!entries.length) return {};

    const n = entries[0];
    return {
      dnsLookup: round(n.domainLookupEnd - n.domainLookupStart),
      tcpConnect: round(n.connectEnd - n.connectStart),
      tlsHandshake: n.secureConnectionStart > 0
        ? round(n.connectEnd - n.secureConnectionStart) : 0,
      ttfb: round(n.responseStart - n.requestStart),
      download: round(n.responseEnd - n.responseStart),
      domInteractive: round(n.domInteractive - n.fetchStart),
      domComplete: round(n.domComplete - n.fetchStart),
      loadEvent: round(n.loadEventEnd - n.fetchStart),
      fetchTime: round(n.responseEnd - n.fetchStart),
      transferSize: n.transferSize,
      headerSize: n.transferSize - n.encodedBodySize
    };
  }

  // ── Resource Timing ───────────────────────────────────────────────

  /**
   * Aggregate resource timing data by initiator type.
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

    return { totalResources: resources.length, byType: summary };
  }

  // ── Web Vitals ────────────────────────────────────────────────────

  /**
   * Initialize PerformanceObserver watchers for Core Web Vitals:
   * LCP (Largest Contentful Paint), FID (First Input Delay), CLS (Cumulative Layout Shift).
   */
  function initVitalsObservers() {
    // LCP — Largest Contentful Paint
    if (typeof PerformanceObserver !== 'undefined') {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length) {
            vitalsData.lcp = round(entries[entries.length - 1].startTime);
            log('LCP:', vitalsData.lcp, 'ms');
          }
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (e) { /* LCP not supported */ }

      // FID — First Input Delay
      try {
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length) {
            vitalsData.fid = round(entries[0].processingStart - entries[0].startTime);
            log('FID:', vitalsData.fid, 'ms');
          }
        });
        fidObserver.observe({ type: 'first-input', buffered: true });
      } catch (e) { /* FID not supported */ }

      // CLS — Cumulative Layout Shift
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          });
          vitalsData.cls = round(clsValue);
          log('CLS:', vitalsData.cls);
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });
      } catch (e) { /* CLS not supported */ }
    }
  }

  // ── Error Tracking ────────────────────────────────────────────────

  /**
   * Set up global error and unhandled promise rejection handlers.
   */
  function initErrorTracking() {
    window.addEventListener('error', (e) => {
      const payload = buildPayload('error');
      payload.error = {
        message: e.message,
        source: e.filename,
        line: e.lineno,
        column: e.colno,
        stack: e.error ? e.error.stack : null
      };
      send(payload);
    });

    window.addEventListener('unhandledrejection', (e) => {
      const payload = buildPayload('unhandled_rejection');
      payload.error = {
        message: String(e.reason),
        stack: (e.reason && e.reason.stack) ? e.reason.stack : null
      };
      send(payload);
    });

    log('Error tracking enabled');
  }

  // ── Payload Construction ──────────────────────────────────────────

  /**
   * Build a beacon payload with base fields and global properties.
   */
  function buildPayload(eventName) {
    const payload = {
      url: window.location.href,
      title: document.title,
      referrer: document.referrer,
      timestamp: new Date().toISOString(),
      type: eventName,
      session: getSessionId()
    };

    // Merge global properties
    for (const k of Object.keys(globalProps)) {
      payload[k] = globalProps[k];
    }

    // Attach vitals if available
    if (Object.keys(vitalsData).length > 0) {
      payload.vitals = vitalsData;
    }

    return payload;
  }

  // ── Payload Delivery ──────────────────────────────────────────────

  /**
   * Send the payload to the analytics endpoint.
   * In debug mode, logs to console instead of sending.
   */
  function send(payload) {
    // Record in beacon log (for test page introspection)
    beaconLog.push({ time: new Date().toISOString(), payload: payload });

    // Dispatch custom event so test pages can react
    try {
      window.dispatchEvent(new CustomEvent('collector:beacon', { detail: payload }));
    } catch (e) { /* CustomEvent not supported */ }

    if (config.debug) {
      console.log('[Collector] Would send:', payload);
      return; // Don't actually send in debug mode
    }

    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(config.endpoint, blob);
      log('Beacon sent via sendBeacon');
    } else {
      fetch(config.endpoint, {
        method: 'POST',
        body: blob,
        keepalive: true
      }).catch((err) => {
        warn('Send failed:', err.message);
      });
      log('Beacon sent via fetch');
    }
  }

  // ── Public API ────────────────────────────────────────────────────

  /**
   * init(options) — Configure and start the collector.
   */
  function init(options) {
    if (initialized) {
      warn('collector.init() called more than once');
      return;
    }

    // Merge user options with defaults
    config = {};
    for (const key of Object.keys(defaults)) {
      config[key] = (options && options[key] !== undefined)
        ? options[key]
        : defaults[key];
    }

    // Sampling: decide once per session whether to collect
    if (!shouldSample()) {
      log(`Session not sampled (rate: ${config.sampleRate})`);
      // Dispatch event so test page can show unsampled state
      try {
        window.dispatchEvent(new CustomEvent('collector:not-sampled'));
      } catch (e) { /* ignore */ }
      return;
    }

    initialized = true;

    // Start automatic collection based on config flags
    if (config.enableErrors) initErrorTracking();
    if (config.enableVitals) initVitalsObservers();

    // Fire pageview beacon after load
    window.addEventListener('load', () => {
      setTimeout(() => {
        const payload = buildPayload('pageview');
        if (config.enableTiming) {
          payload.timing = getNavigationTiming();
          payload.resources = getResourceSummary();
        }
        if (config.enableTechnographics) {
          payload.technographics = getTechnographics();
        }
        send(payload);
      }, 0);
    });

    log('Collector initialized', config);

    // Dispatch event so test page can update UI
    try {
      window.dispatchEvent(new CustomEvent('collector:initialized', { detail: config }));
    } catch (e) { /* ignore */ }
  }

  /**
   * track(eventName, data) — Send a custom event with optional data.
   */
  function track(eventName, data) {
    if (!initialized) {
      warn('collector.track() called before init()');
      return;
    }
    const payload = buildPayload(eventName);
    if (data) payload.data = data;
    send(payload);
  }

  /**
   * set(key, value) — Attach a property to every future beacon.
   */
  function set(key, value) {
    globalProps[key] = value;
    log('Global property set:', key, '=', value);

    // Dispatch event so test page can update UI
    try {
      window.dispatchEvent(new CustomEvent('collector:set', {
        detail: { key: key, value: value }
      }));
    } catch (e) { /* ignore */ }
  }

  /**
   * identify(userId) — Link the session to an authenticated user.
   */
  function identify(userId) {
    globalProps.userId = userId;
    log('User identified:', userId);

    // Dispatch event so test page can update UI
    try {
      window.dispatchEvent(new CustomEvent('collector:identify', {
        detail: { userId: userId }
      }));
    } catch (e) { /* ignore */ }
  }

  // ── Expose Public API ─────────────────────────────────────────────

  return {
    init: init,
    track: track,
    set: set,
    identify: identify,

    // Expose read-only accessors for test/debug pages
    _getConfig: () => JSON.parse(JSON.stringify(config)),
    _getGlobalProps: () => JSON.parse(JSON.stringify(globalProps)),
    _getBeaconLog: () => beaconLog.slice(),
    _isInitialized: () => initialized,
    _isSampled: () => {
      const s = sessionStorage.getItem('_collector_sampled');
      return s === 'true';
    }
  };

})();
