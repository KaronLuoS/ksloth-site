/**
 * putting powell's collector together
 */

(function () {
  'use strict';

  // ── Configuration ──────────────────────────────────────────────────
  const ENDPOINT = 'https://collector.ksloth.scripts/log.php'; 
  const MAX_ERRORS = 10;
  const IDLE_THRESHOLD = 2000;


  // ── Error Tracking State ──────────────────────────────────────────
  const reportedErrors = new Set();
  let errorCount = 0;

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

  // ── CSS and Image ────────────────────────────────────────────
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
      imagesAllowed: checkImagesAllowed(),
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
      timingObject:entries.toJSON(),
      loadStart: round(n.fetchStart),
      loadEnd: round(n.loadEventEnd),
      loadEvent: round(n.loadEventEnd - n.fetchStart)
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
      console.log('[collector-v4-1] Beacon sent');
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        body: blob,
        keepalive: true
      }).catch((err) => {
        console.warn('[collector-v4-1] fetch fallback error:', err.message);
      });
    }

    console.log('[collector-v4-1] payload:', payload);
  }

  // ── Error Tracking ─────────────────────────────────────────────────

  /**
   * Report an error with deduplication and rate limiting.
   * Prevents beacon storms from repeated errors (e.g., in render loops).
   */

  function reportError(errorData) {
    // Rate limit: max errors per page load
    if (errorCount >= MAX_ERRORS) {
      console.log(`[collector-v4-1] Error rate limit reached (${MAX_ERRORS}), ignoring:`, errorData.message);
      return;
    }

    // Deduplicate by type + message + source + line
    const key = `${errorData.type}:${errorData.message || ''}:${errorData.source || ''}:${errorData.line || ''}`;
    if (reportedErrors.has(key)) {
      console.log('[collector-v4-1] Duplicate error suppressed:', errorData.message);
      return;
    }
    reportedErrors.add(key);
    errorCount++;

    console.log(`[collector-v4-1] Error #${errorCount}:`, errorData.type, '-', errorData.message);

    // Send error beacon
    const payload = {
      type: 'error',
      error: errorData,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      session: getSessionId()
    };

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
          stack: event.error ? event.error.stack : '',
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

    console.log('[collector-v4-1] Error tracking initialized');
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
    const payload = {
      type: 'activity',
      activity: activityData,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      session: getSessionId()
    };

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
      console.log(`[collector-v4-1] Idle break ended. Duration: ${now - lastActivityTime}ms`);
      isIdle = false;
    }
    
    lastActivityTime = now;
    clearTimeout(idleTimer);
    
    // New timer to flag the user as idle after 2 seconds
    idleTimer = setTimeout(() => {
      isIdle = true;
      console.log('[collector-v4-1] User is now idle...');
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
    
    console.log('[collector-v4-1] Activity tracking initialized');
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
      errorCount: errorCount
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
    getTechnographics: getTechnographics,
    getSessionId: getSessionId,
    getNetworkInfo: getNetworkInfo,
    reportError: reportError,
    collect: collect,
    getErrorCount: () => errorCount,
    getReportedErrors: () => Array.from(reportedErrors)
  };

})();
