const ua = navigator.userAgent;
const language = navigator.language;

const viewport = {
    width: window.innerWidth,
    height: window.innerHeight
};

const screen = {
    width: window.screen.width,
    height: window.screen.height,
    pixelRatio: window.screen.devicePixelRatio
};

const hardware = {
  cores: navigator.hardwareConcurrency || 0,
  memory: navigator.deviceMemory || 0
};

function getNetworkInfo() {
  if (!('connection' in navigator)) return {};

  const conn = navigator.connection;
  return {
    effectiveType: conn.effectiveType,  // 'slow-2g', '2g', '3g', '4g'
    downlink: conn.downlink,            // Mbps estimate
    rtt: conn.rtt,                      // Round-trip time in ms
    saveData: conn.saveData             // User enabled data saver
  };
}