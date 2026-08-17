#!/usr/bin/env python3
from datetime import datetime
import os

print("Cache-Control: no-cache")
print("Content-Type: text/html")
print()

date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
address = os.environ.get("REMOTE_ADDR", "Unknown IP")

print(f'''
<!DOCTYPE html>
<html>
<head>
<title>Hello CGI World</title>
</head>
<body>
<h1 align="center">Hello HTML World</h1>
<hr/>
<p>This page was generated with the Python programming language, and karon wrote this code ;P</p>
<p>Python is such a easy language to use</p>
<p>This program was generated at: {date}</p>
<p>Your current IP Address is: {address}</p>
</body>
</html>''')