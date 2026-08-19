#!/usr/bin/env python3
import os
import sys
import time
import json

# Storage locations
MAP_FILE = "/tmp/fp_map.json"

def load_map():
    try:
        with open(MAP_FILE, "r") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}

def save_map(m):
    with open(MAP_FILE, "w") as f:
        json.dump(m, f)

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
        <!-- Load the open-source FingerprintJS library -->
        <script src="https://openfpcdn.io/fingerprintjs/v4" async></script>
    </head>
    <body style="font-family: sans-serif; padding: 20px; max-width: 600px;">
        <h2>Fingerprint State Demo</h2>
        <p>Your Unique Device Hash: <em id="fp-display" style="color: blue;">Calculating...</em></p>
        
        <status-box id="status-box" style="padding: 15px; background: #eee; margin-bottom: 20px; border-radius: 5px;">
            Checking session...
        </status-box>

        <input type="text" id="user-data" placeholder="Enter data to save" style="padding: 5px; width: 250px;">
        <button onclick="saveData()" style="padding: 5px 10px;">Save Data</button>
        <hr>
        <button onclick="clearCookies()" style="padding: 5px 10px; color: red;">Clear Cookies</button>
        <button onclick="location.reload()" style="padding: 5px 10px;">Refresh Page</button>

        <script>
            let fpId = "";
            
            // Initialize FingerprintJS on load
            window.onload = () => {
                import('https://openfpcdn.io/fingerprintjs/v4')
                    .then(FingerprintJS => FingerprintJS.load())
                    .then(fp => fp.get())
                    .then(result => {
                        fpId = result.visitorId;
                        document.getElementById('fp-display').innerText = fpId;
                        checkSession(); // Send fingerprint to backend
                    });
            };

            function checkSession() {
                fetch(`?action=status&fp_id=${fpId}`)
                    .then(r => r.json())
                    .then(data => {
                        let box = document.getElementById('status-box');
                        if (data.status === 'restored') {
                            box.innerHTML = `<h3 style="color: green; margin-top:0;">Session Restored via Fingerprint!</h3><p>We noticed you cleared your cookies, but we recognized your device.</p><em>Saved Data:</em> ${data.saved_data}`;
                        } else if (data.status === 'active') {
                            box.innerHTML = `<h3 style="margin-top:0;">Active Session (Cookie Found)</h3><em>Saved Data:</em> ${data.saved_data}`;
                        } else {
                            box.innerHTML = `<h3 style="margin-top:0;">New Session</h3>No data saved yet.`;
                        }
                    });
            }

            function saveData() {
                let val = document.getElementById('user-data').value;
                fetch(`?action=save&fp_id=${fpId}`, {
                    method: 'POST',
                    body: val
                }).then(() => checkSession());
            }

            function clearCookies() {
                document.cookie = "session_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                alert("Cookies cleared! Now refresh the page. The server will use your fingerprint to log you back in.");
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
    if fp_id and fp_map.get(fp_id) != sid:
        fp_map[fp_id] = sid
        save_map(fp_map)
else:
    if fp_id in fp_map:
        sid = fp_map[fp_id]
        set_cookie_header = f"Set-Cookie: session_id={sid}; Path=/;"
        status_msg = "restored"
    else:
        # Brand new user
        timestamp = time.time_ns()
        pid = os.getpid()
        sid = f"{timestamp}_{pid}"
        set_cookie_header = f"Set-Cookie: session_id={sid}; Path=/;"
        if fp_id:
            fp_map[fp_id] = sid
            save_map(fp_map)

if "action=save" in qs and method == "POST":
    content_length = int(os.environ.get("CONTENT_LENGTH", 0))
    body = sys.stdin.read(content_length) if content_length > 0 else ""
    with open(f"/tmp/python_sess_{sid}.txt", "w") as f:
        f.write(body)

saved_data = ""
try:
    with open(f"/tmp/python_sess_{sid}.txt", "r") as f:
        saved_data = f.read()
except OSError:
    saved_data = "None"

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