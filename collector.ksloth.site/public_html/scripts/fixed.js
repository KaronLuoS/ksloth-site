/**
 * collector-v7.1.js — fixed
 * putting powell's collector together
 *
 * Fixes applied from code review:
 *  1. Added the missing buildPayload() — pageview beacons and track() were
 *     throwing ReferenceError without it.
 *  2. getNavigationTiming(): entries.toJSON() -> n.toJSON() (entries is an
 *     array; toJSON() lives on the individual PerformanceEntry).
 *  3. send(): fixed undefined ENDPOINT -> config.endpoint in the fetch
 *     fallback, restored the debug-mode short-circuit, fixed the log
 *     placement so it doesn't claim "sent via fetch" after sendBeacon.
 *  4. checkCssAllowed(): now tests a rule from a real <style> stylesheet
 *     instead of an inline style (inline styles aren't affected by a
 *     browser's "disable CSS" setting, so the old check basically always
 *     returned true).
 *  5. checkImagesAllowed(): now requests a real network image (not a
 *     data: URI, which bypasses image-blocking) and waits for
 *     onload/onerror instead of checking img.complete synchronously.
 *     Kicked off at script-load time so it has a chance to resolve before
 *     the pageview beacon fires; if it hasn't resolved yet, we send a
 *     one-time correction beacon once it does.
 *  6. Removed the duplicate/mislabeled visibilitychange handler in init()
 *     that re-sent a full 'pageview' payload on exit — the lifecycle
 *     'left' activity event (already sent from initActivityTracking)
 *     covers "when the user left the page."
 *  7. jsAllowed is still hardcoded true here (if this script is running,
 *     JS is obviously on) — see the comment on getTechnographics() for
 *     why you still need a <noscript> fallback pixel in your HTML to
 *     catch the no-JS visitors this script can never see.
 */

const collector = (function () {
  'use strict';

  // ── Private State ─────────────────────────────────────────────────

  let config = {};
  let initialized = false;
  const globalProps = {};
  const beaconLog = [];       // Track sent beacons (for test page)

  // ── Default Configuration ─────────────────────────────────────────

  const defaults = {
    endpoint: 'https://collector.ksloth.scripts/log.php',
    enableTechnographics: true,
    enableTiming: true,
    enableErrors: true,
    enableActivities: true,
    sampleRate: 1.0,        // 1.0 = 100% of sessions
    debug: false            // true = log to console instead of sending
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

  // ── Constants ────────────────────────────────────────────────────
  const MAX_ERRORS = 10;
  const IDLE_THRESHOLD = 2000;

  // ── Error Tracking State ──────────────────────────────────────────
  const reportedErrors = new Set();
  let errorCount = 0;

  // ── Utility ───────────────────────────────────────────────────────

  function round(n) {
    return Math.round(n * 100) / 100;
  }

  // ── Session Identity ──────────────────────────────────────────────

  function getSessionId() {
    let sid = sessionStorage.getItem('_collector_sid');
    if (!sid) {
      sid = Math.random().toString(36).substring(2) + Date.now().toString(36);
      sessionStorage.setItem('_collector_sid', sid);
    }
    return sid;
  }

  // ── Sampling ──────────────────────────────────────────────────────

  function shouldSample() {
    const sampled = sessionStorage.getItem('_collector_sampled');
    if (sampled !== null) return sampled === 'true';

    const result = Math.random() < config.sampleRate;
    sessionStorage.setItem('_collector_sampled', String(result));
    return result;
  }

  // ── Network Information ───────────────────────────────────────────

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

  // ── CSS and Image checks ────────────────────────────────────────────

  /**
   * Tests whether the browser actually applies CSS from a stylesheet.
   * IMPORTANT: this has to come from a real <style>/<link> rule, not an
   * inline style set via JS — inline styles are unaffected by a
   * "disable CSS" setting, so testing them always reports "allowed."
   */
  function checkCssAllowed() {
    try {
      const style = document.createElement('style');
      style.textContent = '.collector-css-test{position:absolute;left:-9999px;width:12px;}';
      document.head.appendChild(style);

      const testEl = document.createElement('div');
      testEl.className = 'collector-css-test';
      document.body.appendChild(testEl);

      const applied = window.getComputedStyle(testEl).width === '12px';

      testEl.remove();
      style.remove();
      return applied;
    } catch (e) {
      return false;
    }
  }

  /**
   * Tests whether the browser actually loads images over the network.
   * A data: URI would bypass most image-blocking settings, so this
   * requests a real file and waits for onload/onerror instead of
   * checking img.complete synchronously (which is almost always false
   * immediately after setting .src, since loading is async).
   *
   * Replace the src below with a real 1x1 pixel hosted on your domain.
   */
  let imagesAllowedResult = null; // null = still unresolved

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
      img.src = 'https://collector.ksloth.scripts/pixel.gif?_=' + Date.now();
    } catch (e) {
      imagesAllowedResult = false;
    }
  }

  // Kick the image check off immediately so it has time to resolve
  // before the load-event pageview beacon fires.
  checkImagesAllowed();

  let sentInitialPageview = false;

  /**
   * If the images check resolves AFTER the pageview beacon already went
   * out, send a small follow-up event so the data isn't lost.
   */
  function maybeSendLateTechnographicUpdate() {
    if (sentInitialPageview && initialized) {
      track('technographics-update', { imagesAllowed: imagesAllowedResult });
    }
  }

  // ── Technographics ────────────────────────────────────────────────

  /**
   * jsAllowed is hardcoded true because, by definition, this script is
   * only running for users who have JavaScript enabled. It CANNOT tell
   * you about users who have JS disabled — this script never executes
   * for them at all. To capture those users, add a <noscript> fallback
   * pixel in your HTML pointing at the same endpoint with jsAllowed=0,
   * e.g.:
   *   <noscript><img src="https://collector.ksloth.scripts/log.php?jsAllowed=0" /></noscript>
   */
  function getTechnographics() {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      cookiesEnabled: navigator.cookieEnabled,
      jsAllowed: true,
      cssAllowed: checkCssAllowed(),
      imagesAllowed: imagesAllowedResult, // may be null if not resolved yet
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      pixelRatio: window.devicePixelRatio,
      network: getNetworkInfo()
    };
  }

  // ── Navigation Timing ────────────────────────────────────────────────

  function getNavigationTiming() {
    const entries = performance.getEntriesByType('navigation');
    if (!entries.length) return {};

    const n = entries[0];

    return {
      timingObject: n.toJSON(),                              // whole timing object
      loadStart: round(n.fetchStart),                         // when page started loading
      loadEnd: round(n.loadEventEnd),                         // when page ended loading
      totalLoadTimeMs: round(n.loadEventEnd - n.fetchStart)   // manually calculated total, in ms
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

  // ── Payload Delivery ──────────────────────────────────────────────

  function send(payload) {
    // Record in beacon log (for test page introspection)
    beaconLog.push({ time: new Date().toISOString(), payload: payload });

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
      log('Beacon sent via fetch');
    }
  }

  // ── Error Tracking ──────────────────────────────────────────────────

  function reportError(errorData) {
    if (errorCount >= MAX_ERRORS) {
      log(`Error rate limit reached (${MAX_ERRORS}), ignoring:`, errorData.message);
      return;
    }

    const key = `${errorData.type}:${errorData.message || ''}:${errorData.source || ''}:${errorData.line || ''}`;
    if (reportedErrors.has(key)) {
      log('Duplicate error suppressed:', errorData.message);
      return;
    }
    reportedErrors.add(key);
    errorCount++;

    log(`Error #${errorCount}:`, errorData.type, '-', errorData.message);

    const payload = buildPayload('error');
    payload.error = errorData;
    send(payload);

    window.dispatchEvent(new CustomEvent('collector:error', { detail: { errorData: errorData, count: errorCount } }));
  }

  function initErrorTracking() {
    window.addEventListener('error', (event) => {
      if (event instanceof ErrorEvent) {
        reportError({
          type: 'js-error',
          message: event.message,
          source: event.filename,
          line: event.lineno,
          column: event.colno,
          stack: event.error ? event.error.stack : null
        });
      } else {
        const target = event.target;
        if (target && (target.tagName === 'IMG' || target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
          reportError({
            type: 'resource-error',
            tagName: target.tagName,
            src: target.src || target.href || ''
          });
        }
      }
    }, true); // capture phase required for resource errors

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      reportError({
        type: 'promise-rejection',
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : ''
      });
    });

    log('Error tracking enabled');
  }

  // ── Activity Tracking ────────────────────────────────────────────────

  let lastActivityTime = Date.now();
  let idleTimer = null;
  let isIdle = false;

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

  function reportActivity(activityData) {
    const payload = buildPayload('activity');
    payload.activity = activityData;
    send(payload);

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

    idleTimer = setTimeout(() => {
      isIdle = true;
      log('User is now idle...');
    }, IDLE_THRESHOLD);
  }

  function initActivityTracking() {

    // --- 1. Page Lifecycle (Entered & Left) ---

    reportActivity({ type: 'lifecycle', state: 'entered' });

    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        reportActivity({ type: 'lifecycle', state: 'left' });
      }
    });

    // --- 2. Mouse Activity ---

    window.addEventListener('mousemove', throttle((event) => {
      pingActivity();
      reportActivity({ type: 'mousemove', x: event.clientX, y: event.clientY });
    }, 250));

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

    window.addEventListener('scroll', throttle(() => {
      pingActivity();
      reportActivity({ type: 'scroll', x: Math.round(window.scrollX), y: Math.round(window.scrollY) });
    }, 250));

    // --- 4. Keyboard Activity ---

    window.addEventListener('keydown', (event) => {
      pingActivity();
      reportActivity({ type: 'keydown', key: event.key });
    });

    window.addEventListener('keyup', (event) => {
      pingActivity();
      reportActivity({ type: 'keyup', key: event.key });
    });

    // Start the initial idle timer
    pingActivity();

    log('Activity tracking initialized');
  }

  // ── Public API ────────────────────────────────────────────────────

  function init(options) {
    if (initialized) {
      warn('collector.init() called more than once');
      return;
    }

    config = {};
    for (const key of Object.keys(defaults)) {
      config[key] = (options && options[key] !== undefined) ? options[key] : defaults[key];
    }

    if (!shouldSample()) {
      log(`Session not sampled (rate: ${config.sampleRate})`);
      try {
        window.dispatchEvent(new CustomEvent('collector:not-sampled'));
      } catch (e) { /* ignore */ }
      return;
    }

    initialized = true;

    if (config.enableErrors) initErrorTracking();
    if (config.enableActivities) initActivityTracking();

    // Fire pageview beacon after load (once — the duplicate exit-time
    // pageview beacon from the previous version has been removed; the
    // 'lifecycle: left' activity event above already covers page-exit)
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
        sentInitialPageview = true;
      }, 0);
    });

    log('Collector initialized', config);

    try {
      window.dispatchEvent(new CustomEvent('collector:initialized', { detail: config }));
    } catch (e) { /* ignore */ }
  }

  function track(eventName, data) {
    if (!initialized) {
      warn('collector.track() called before init()');
      return;
    }
    const payload = buildPayload(eventName);
    if (data) payload.data = data;
    send(payload);
  }

  function set(key, value) {
    globalProps[key] = value;
    log('Global property set:', key, '=', value);
    try {
      window.dispatchEvent(new CustomEvent('collector:set', { detail: { key: key, value: value } }));
    } catch (e) { /* ignore */ }
  }

  function identify(userId) {
    globalProps.userId = userId;
    log('User identified:', userId);
    try {
      window.dispatchEvent(new CustomEvent('collector:identify', { detail: { userId: userId } }));
    } catch (e) { /* ignore */ }
  }

  // ── Expose Public API ─────────────────────────────────────────────

  return {
    init: init,
    track: track,
    set: set,
    identify: identify,

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