/**
 * putting powell's collector together
 */

const collector = (function () {
  'use strict';

  // ── Private State ─────────────────────────────────────────────────

  let config = {};
  let initialized = false;
  const globalProps = {};
  const beaconLog = [];       // Track sent beacons (for test page)s
  
  // ── Default Configuration ─────────────────────────────────────────

  const defaults = {
    endpoint: 'https://collector.ksloth.site/scripts/log.php',
    enableTechnographics: true,
    enableTiming: true,
    enableErrors: true,
    enableActivities: true,
    sampleRate: 1.0,        // 1.0 = 100% of sessions
    debug: false             // true = log to console instead of sending
  };

  // ── Logging ───────────────────────────────────────────────────────

  function log(...args) {
    if (config.debug) {
      console.log('[Collector]', ...args);
    }
  }

  function warn(...args) {
    console.warn('[Collector]', ...args);
  }

  // ── Constants ──────────────────────────────────────────────────
  const MAX_ERRORS = 10;
  const IDLE_THRESHOLD = 2000;

  // ── Error Tracking State ──────────────────────────────────────────
  const reportedErrors = new Set();
  let errorCount = 0;

  // ── Utility ────────────────────────────────────────────────────────

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

  // ── CSS and Image ────────────────────────────────────────────
  function checkCssAllowed() {
    try {
      const style = document.createElement('style');
      style.textContent = '.collector-css-test{position:absolute;left:-9999px;width:12px;}';
      document.head.appendChild(style);

      const testEl = document.createElement('div');
      testEl.className = 'collector-css-test';
      document.body.appendChild(testEl);

      const applied = window.getComputedStyle(testEl).height === '12px';

      testEl.remove();
      style.remove();
      return applied;
    } catch (e) {
      return false;
    }
  }

  let imagesAllowedResult = null;

  function checkImagesAllowed() {
    try {
      const img = new Image();
      img.onload = () => {
        imagesAllowedResult = img.naturalWidth > 0;
        log('Images allowed:', imagesAllowedResult);
        maybeSendLateTechnographicUpdate();
      };
      img.onerror = () => {
        imagesAllowedResult = false;
        log('Images blocked');
        maybeSendLateTechnographicUpdate();
      };
      img.src = 'https://collector.ksloth.site/scripts/pixel.gif';
    } catch (e) {
      imagesAllowedResult = false;
    }
  }

  checkImagesAllowed();

  let sentInitialPageview = false;

  /**
   * If the images check resolves AFTER the pageview beacon already went
   * out, send a small follow-up event so the data isn't lost. Credit to Claude Idk that this is needed.
   */
  function maybeSendLateTechnographicUpdate() {
    if (sentInitialPageview && initialized) {
      track('technographics-update', { imagesAllowed: imagesAllowedResult });
    }
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
      jsAllowed: true,
      cssAllowed: checkCssAllowed(),
      imagesAllowed: imagesAllowedResult,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      pixelRatio: window.devicePixelRatio,
      network: getNetworkInfo()
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
      timingObject:n.toJSON(),
      loadStart: round(n.fetchStart),
      loadEnd: round(n.loadEventEnd),
      loadEvent: round(n.loadEventEnd - n.fetchStart)
    };
  }

  // ── Payload Construction ──────────────────────────────────────────

  /**
   * Build a beacon payload with base fields and global properties.
   * (This was missing entirely in v7.1 — pageview + track() beacons
   * were throwing ReferenceError without it.)
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

    for (const k of Object.keys(globalProps)) {
      payload[k] = globalProps[k];
    }

    return payload;
  }


  // ── Payload Delivery ───────────────────────────────────────────────

  /**
   * Send the payload to the analytics endpoint via sendBeacon,
   * falling back to fetch with keepalive.
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
      return; // don't actually send in debug mode
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
    }
    log('Beacon sent via fetch:', payload);
  }

  // ── Error Tracking ─────────────────────────────────────────────────

  /**
   * Report an error with deduplication and rate limiting.
   * Prevents beacon storms from repeated errors (e.g., in render loops).
   */

  function reportError(errorData) {
    // Rate limit: max errors per page load
    if (errorCount >= MAX_ERRORS) {
      log(`Error rate limit reached (${MAX_ERRORS}), ignoring:`, errorData.message);
      return;
    }

    // Deduplicate by type + message + source + line
    const key = `${errorData.type}:${errorData.message || ''}:${errorData.source || ''}:${errorData.line || ''}`;
    if (reportedErrors.has(key)) {
      log('Duplicate error suppressed:', errorData.message);
      return;
    }
    reportedErrors.add(key);
    errorCount++;

    log(`Error #${errorCount}:`, errorData.type, '-', errorData.message);

    // Send error beacon
    const payload = buildPayload('error');
    payload.error = errorData;

    send(payload);

    // Dispatch custom event so test pages can display the error
    window.dispatchEvent(new CustomEvent('collector:error', { detail: { errorData: errorData, count: errorCount } }));
  }

  /**
   * Initialize error listeners for JS errors, resource load failures,
   * and unhandled promise rejections.
   */
  function initErrorTracking() {
    // JS runtime errors AND resource load failures (capture phase for resources)
    window.addEventListener('error', (event) => {
      if (event instanceof ErrorEvent) {
        // JavaScript runtime error
        reportError({
          type: 'js-error',
          message: event.message,
          source: event.filename,
          line: event.lineno,
          column: event.colno,
          stack: event.error ? event.error.stack : null,
          url: window.location.href
        });
      } else {
        // Resource load failure (IMG, SCRIPT, LINK)
        const target = event.target;
        if (target && (target.tagName === 'IMG' || target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
          reportError({
            type: 'resource-error',
            tagName: target.tagName,
            src: target.src || target.href || '',
            url: window.location.href
          });
        }
      }
    }, true); // capture phase required for resource errors

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      reportError({
        type: 'promise-rejection',
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : '',
        url: window.location.href
      });
    });

    log('Error tracking enabled');
  }

// ── Activity Tracking ──────────────────────────────────────────────

  let lastActivityTime = Date.now();
  let idleTimer = null;
  let isIdle = false;

  /**
   * Helper utility to throttle continuous events (scroll, mousemove).
   * Ensures the callback only fires once every 'delay' milliseconds.
   */
  function throttle(func, delay) {
    let lastCall = 0;
    return function (...args) {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        func.apply(this, args);
      }
    };
  }

  /**
   * Report an activity event.
   * Standardizes the payload structure and dispatches custom events for testing.
   */
  function reportActivity(activityData) {
    const payload = buildPayload('activity');
    payload.activity = activityData;

    send(payload);

    // Dispatch custom event so test pages can display the activity
    window.dispatchEvent(new CustomEvent('collector:activity', { detail: { activityData: activityData } }));
  }

  function pingActivity() {
    const now = Date.now();
    
    if (isIdle) {
      reportActivity({
        type: 'idle-break',
        endedAt: new Date(now).toISOString(),
        durationMs: now - lastActivityTime
      });
      log(`Idle break ended. Duration: ${now - lastActivityTime}ms`);
      isIdle = false;
    }
    
    lastActivityTime = now;
    clearTimeout(idleTimer);
    
    // New timer to flag the user as idle after 2 seconds
    idleTimer = setTimeout(() => {
      isIdle = true;
      log('[collector-v4-1] User is now idle...');
    }, IDLE_THRESHOLD);
  }

  /**
   * Initialize activity listeners.
   */
  function initActivityTracking() {
    
    // --- 1. Page Lifecycle (Entered & Left) ---
    
    reportActivity({ type: 'lifecycle', state: 'entered' });
    
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        reportActivity({ type: 'lifecycle', state: 'left' });
      }
    });

    // --- 2. Mouse Activity ---

    // Cursor positions (max 4 times a second)
    window.addEventListener('mousemove', throttle((event) => {
      pingActivity();
      reportActivity({
        type: 'mousemove',
        x: event.clientX,
        y: event.clientY
      });
    }, 250));

    // Clicks (Capturing coordinates and which button)
    window.addEventListener('mousedown', (event) => {
      pingActivity();
      const buttonMap = { 0: 'left', 1: 'middle', 2: 'right' };
      
      reportActivity({
        type: 'click',
        button: buttonMap[event.button] || 'unknown',
        x: event.clientX,
        y: event.clientY
      });
    });

    // --- 3. Scroll Activity ---

    // Scrolling (max 4 times a second)
    window.addEventListener('scroll', throttle(() => {
      pingActivity();
      reportActivity({
        type: 'scroll',
        x: Math.round(window.scrollX),
        y: Math.round(window.scrollY)
      });
    }, 250));

    // --- 4. Keyboard Activity ---

    window.addEventListener('keydown', (event) => {
      pingActivity();
      reportActivity({
        type: 'keydown',
        key: event.key
      });
    });

    window.addEventListener('keyup', (event) => {
      pingActivity();
      reportActivity({
        type: 'keyup',
        key: event.key
      });
    });

    // Start the initial idle timer
    pingActivity();
    
    log('Activity tracking initialized');
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
    if (config.enableActivities) initActivityTracking();

    // Fire pageview beacon after load
    window.addEventListener('load', () => {
      setTimeout(() => {
        const payload = buildPayload('pageview');
        if (config.enableTiming) {
          payload.timing = getNavigationTiming();
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
