#!/usr/bin/env python3
import os
import sys
import time
import json

MAP_FILE = "/tmp/fp_map.json"

def load_map():
    try:
        with open(MAP_FILE, "r") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}

def save_map(m):
    try:
        with open(MAP_FILE, "w") as f:
            json.dump(m, f)
    except OSError:
        pass

def get_session_id():
    cookie_hdr = os.environ.get("HTTP_COOKIE", "")
    for part in cookie_hdr.split(";"):
        name, separator, value = part.strip().partition("=")
        if name == "session_id" and separator:
            return value
    return None

qs = os.environ.get("QUERY_STRING", "")
method = os.environ.get("REQUEST_METHOD", "GET")


if "action=" not in qs:
    print("Cache-Control: no-cache")
    print("Content-Type: text/html\n")
    print("""<!DOCTYPE html>
    <html>
    <head>
        <title>Fingerprint Reassociation Demo</title>
    </head>
    <body>
        <h2>Browser Fingerprint & State Demo</h2>
        
        <Section>
            <h3>Your Device Fingerprint:</h3>
            <p id="fp-display">Calculating fingerprint...</p>
        </Section>
        
        <status-box id="status-box">
            Initializing session...
        </status-box>

        <Section>
        <h3>Save Server Data</h3>
        <input type="text" id="user-data" placeholder="Type a secret message..." style="padding: 8px; width: 65%; font-size: 14px;">
        <button onclick="saveData()" style="padding: 8px 15px; font-size: 14px; cursor: pointer;">Save Data</button>
        </Section>

        <Section>
        <h3>Test Cookie Clearing Simulation</h3>
        <p>Follow these steps:</p>
        <button onclick="clearCookies()">1. Clear Cookies</button>
        <button onclick="location.reload()">2. Refresh Page</button>
        <Section>

        <!-- FingerprintJS v3 CDN -->
        <script src="https://cdn.jsdelivr.net/npm/@fingerprintjs/fingerprintjs@3/dist/fp.min.js"></script>

        <script>
            let fpId = "";

            // Generate the fingerprint on page load
            FingerprintJS.load()
                .then(fp => fp.get())
                .then(result => {
                    fpId = result.visitorId;
                    document.getElementById('fp-display').innerText = fpId;
                    checkSession();
                })
                .catch(err => {
                    document.getElementById('fp-display').innerText = "Blocked by browser extension / shield";
                });

            function checkSession() {
                fetch(`?action=status&fp_id=${encodeURIComponent(fpId)}`)
                    .then(r => r.json())
                    .then(data => {
                        let box = document.getElementById('status-box');
                        if (data.status === 'restored') {
                            box.style.background = '#e6ffed';
                            box.style.borderColor = '#b7eb8f';
                            box.innerHTML = `<h4> Session Restored via Fingerprint!</h4>
                                            <p>No cookie was found, but fingerprint matched an existing session.</p>
                                            <p>Saved Data:${data.saved_data}</p>`;
                        } else if (data.status === 'active') {
                            box.style.background = '#eef7ff';
                            box.style.borderColor = '#cce3ff';
                            box.innerHTML = `<h4>Active Session Found</h4>
                                            <p >Session ID: <code>${data.session_id}</code></p>
                                            <p>Saved Data:${data.saved_data}</p>`;
                        } else {
                            box.style.background = '#fffbe6';
                            box.style.borderColor = '#ffe58f';
                            box.innerHTML = `<h4>New Session</h4><p>No previous data saved for this fingerprint.</p>`;
                        }
                    });
            }

            function saveData() {
                let val = document.getElementById('user-data').value;
                if (!val) return alert("Please enter data ;)");
                
                fetch(`?action=save&fp_id=${encodeURIComponent(fpId)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_data: val })
                })
                .then(r => r.json())
                .then(() => {
                    alert("Data saved to server!");
                    checkSession();
                });
            }

            function clearCookies() {
                document.cookie = "session_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                alert("Cookie deleted! Now click '2. Refresh Page' to test if the server restores your data using your fingerprint.");
            }
        </script>
    </body>
    </html>""")
    sys.exit(0)


fp_id = ""
for pair in qs.split("&"):
    if pair.startswith("fp_id="):
        fp_id = pair.split("=")[1]

sid = get_session_id()
set_cookie_header = ""
fp_map = load_map()
status_msg = "new"

if sid:
    status_msg = "active"
    if fp_id:
        fp_map[fp_id] = sid
        save_map(fp_map)
else:
    # check if fingerprint is known
    if fp_id and fp_id in fp_map:
        sid = fp_map[fp_id]
        set_cookie_header = f"Set-Cookie: session_id={sid}; Path=/;"
        status_msg = "restored"
    else:
        # new session ID
        timestamp = time.time_ns()
        pid = os.getpid()
        sid = f"{timestamp}_{pid}"
        set_cookie_header = f"Set-Cookie: session_id={sid}; Path=/;"
        if fp_id:
            fp_map[fp_id] = sid
            save_map(fp_map)

if "action=save" in qs and method == "POST":
    raw_len = os.environ.get("CONTENT_LENGTH", "0")
    content_length = int(raw_len) if raw_len.isdigit() else 0
    body = sys.stdin.read(content_length) if content_length > 0 else "{}"
    
    try:
        payload = json.loads(body)
        user_text = payload.get("user_data", "")
    except ValueError:
        user_text = body

    if sid:
        try:
            with open(f"/tmp/python_sess_{sid}.txt", "w") as f:
                f.write(user_text)
        except OSError:
            pass

saved_data = "(No data saved yet)"
if sid:
    try:
        with open(f"/tmp/python_sess_{sid}.txt", "r") as f:
            content = f.read().strip()
            if content:
                saved_data = content
    except OSError:
        pass

print("Cache-Control: no-cache")
print("Content-Type: application/json")
if set_cookie_header:
    print(set_cookie_header)
print()

print(json.dumps({
    "status": status_msg,
    "session_id": sid,
    "saved_data": saved_data
}))