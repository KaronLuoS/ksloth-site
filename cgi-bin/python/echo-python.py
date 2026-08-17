#!/usr/bin/env python3

import os
import sys
from datetime import datetime

print("Cache-Control: no-cache")
print("Content-Type: text/html")
print()

method = os.environ.get("REQUEST_METHOD", "UNKNOWN")
host = os.environ.get("HTTP_HOST", os.environ.get("SERVER_NAME","Unknown Host"))
user_agent = os.environ.get("HTTP_USER_AGENT", "Unknown Agent")
ip = os.environ.get("REMOTE_ADDR", "Unknown IP")

date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

payload= ""

if method == "GET":
    payload = os.environ.get("QUERY_STRING", "")
else:
    payload = sys.stdin.read()

print("""<!DOCTYPE html>
<html>
<head>
    <title>Python Echo Response</title>
</head>
<body style="font-family: monospace; padding: 20px;">
    <h2>=== Request Metadata ===</h2>""")

print(f"    <p><b>Method:</b> {method}</p>")
print(f"    <p><b>Hostname:</b> {host}</p>")
print(f"    <p><b>Time:</b> {date}</p>")
print(f"    <p><b>User Agent:</b> {user_agent}</p>")
print(f"    <p><b>IP Address:</b> {ip}</p>")

print("    <h2>=== Received Data ===</h2>")
if not payload:
    print("    <p>(No data received)</p>")
else:
    print(f"    <pre style='background: #f0f0f0; padding: 10px;'>{payload}</pre>")

print("""</body>
</html>""")