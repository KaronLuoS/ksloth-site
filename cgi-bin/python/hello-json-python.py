#!/usr/bin/env python3
from datetime import datetime
import os
import json

print("Cache-Control: no-cache")
print("Content-Type: application/json")
print()


data = {
    "title": "Hello, there!",
    "heading": "Hello, Python!",
    "message": "This page was generated with the Python programming language and Karon think it's easier than the other language ;)",
    "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    "IP": os.environ.get("REMOTE_ADDR", "Unknown IP")
}

print(json.dumps(data, indent=4))