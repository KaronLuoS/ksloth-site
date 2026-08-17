#!/usr/bin/env python3

import os
import sys
import time

def get_session_id():
    cookie_hdr = os.environ.get("HTTP_COOKIE", "")
    for part in cookie_hdr.split(";"):
        name, separator, value = part.strip().partition("=")
        if name == "session_id" and separator:
            return value
    return None

qs = os.environ.get("QEURY_STRING","")

sid = get_session_id()
set_cookie_header = ""

if not sid and "action=save" in qs:
    timestamp = time.time_ns()
    pid = os.getpid()
    generated_sid = f"{timestamp}_{pid}"
    set_cookie_header = f"Set-Cookie: session_id={generated_sid}; Path=/;"
    sid = generated_sid

if "action=clear" in qs:
    set_cookie_header= f"Set-Cookie: session_id=; Path=/; Max-Age=0"

print("Cache-Control: no-cache")
print("Content-Type: text/html")

if set_cookie_header:
    print(f"{set_cookie_header}")

print()

print(f"<html><head><title>Python State Demo</title></head><body style=\"font-family: sans-serif; padding: 20px;\">")
print(f"<h2>Python Server-Side State Demo</h2>")
print(f"<nav>")
print(f"  <a href=\"?\">1. Enter Data</a> | ")
print(f"  <a href=\"?action=view\">2. View Saved Data</a> | ")
print(f"  <a href=\"?action=clear\">3. Clear Session</a>")
print(f"</nav><hr>")

if "action=save" in qs:
    content_length = int(os.environ.get("CONTENT_LENGTH", 0))
    body = sys.stdin.read(content_length) if content_length > 0 else ""

    parsed_data = body.replace("user_data=", "").replace("+"," ")

    if sid is not None:
        filepath = f"/tmp/python_sess_{sid}.txt"
        with open(filepath, "w") as file:
            file.write(parsed_data)

        print("<p>Data successfully saved to the server!</p>")
        print('''<p><a href="?action=view">Click here to view it on the next screen.</a></p>''')

elif "action=view" in qs:
    if sid is not None:
        filepath = f"/tmp/python_sess_{sid}.txt"
        try:
            with open(filepath, "r") as file:
                data = file.read()
                print("<p><strong>Data retrieved from server file:</strong></p>")
                print(f'<blockquote style="background: #f0f0f0; padding: 10px;">{data}</blockquote>')
        except OSError:
            print("<p>Session is active, but no data file was found. Did you save data yet?</p>")
    else:
        print("<p>No active session. Please go to the Enter Data screen.</p>")

elif "action=clear" in qs:
    if sid is not None:
        filepath = f"/tmp/python_sess_{sid}.txt"
        try:
            os.remove(filepath)
        except OSError:
            pass
    print("<p>Session cleared and server data file deleted.</p>")

else: 
    print("""
    <form method="POST" action="?action=save">
        <label><strong>Enter some text to save on the server:</strong></label><br><br>
        <input type="text" name="user_data" required style="padding: 5px; width: 300px;">
        <button type="submit" style="padding: 5px 10px;">Save Data</button>
    </form>
    """)

print("</body></html>")