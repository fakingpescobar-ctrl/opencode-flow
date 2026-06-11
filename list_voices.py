import requests, json

headers = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
}
r = requests.get("https://api.elevenlabs.io/v1/shared-voices?page=1&page_size=3&language=russian&sort=likes&descending=true", headers=headers, timeout=20)
print(f"Status: {r.status_code}")
try:
    data = r.json()
    voices = data.get("voices", [])
    print(f"Found: {len(voices)}")
    for v in voices:
        print(f"ID: {v['voice_id']}")
        print(f"Name: {v.get('name','?')}")
        print(f"Desc: {v.get('description','')[:100]}")
        print("---")
except:
    print(r.text[:500])
