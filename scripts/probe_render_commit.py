import urllib.request
import json
import ssl
import sys

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE_URL = "https://roadguard-cad-parser.onrender.com/api/cad"

payload = json.dumps({
    "coordinates": "1000000 500000\n1000100 500000",
    "roadWidth": 7.0,
    "centralMeridian": 105.75,
    "scaleFactor": 1.5,
    "axisOrder": "VN2000_XY"
}).encode("utf-8")

req = urllib.request.Request(
    f"{BASE_URL}/parse-coords",
    data=payload,
    headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
    method="POST"
)

try:
    with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
        print("Status:", resp.status)
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8")
    print(f"HTTP Status: {e.code}")
    sys.stdout.buffer.write(body.encode("utf-8"))
    sys.stdout.buffer.write(b"\n")
