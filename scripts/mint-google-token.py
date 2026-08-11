"""
Mint a read-only Sheets refresh token for the WCB hub, reusing the bot's
existing OAuth client (wcb_bot/credentials.json).

Least-privilege: requests ONLY spreadsheets.readonly (the hub just reads the
roster). Writes GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
to wcb_site/.deploy-secrets.local WITHOUT printing any secret value.

Run from the wcb_site directory:
    python scripts/mint-google-token.py

A browser window opens once for Google consent. Sign in with the WCB account
that can read the roster sheet. Nothing secret is printed to the terminal.
"""
import json
import os
from google_auth_oauthlib.flow import InstalledAppFlow

# Hub only reads the roster. Do NOT request Drive/Gmail/Calendar/Admin here.
SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]

# Reuse the bot's existing "installed" OAuth client.
CLIENT_FILE = os.path.join("..", "wcb_bot", "credentials.json")
OUT_FILE = ".deploy-secrets.local"


def upsert_env(path, updates):
    """Set KEY=value lines in a dotenv-style file, replacing existing keys."""
    lines = []
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            lines = f.read().splitlines()
    seen = set()
    out = []
    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line else None
        if key in updates:
            out.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            out.append(line)
    for key, val in updates.items():
        if key not in seen:
            out.append(f"{key}={val}")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")


def main():
    if not os.path.exists(CLIENT_FILE):
        raise SystemExit(f"ERROR: {CLIENT_FILE} not found (expected the bot's OAuth client).")

    with open(CLIENT_FILE, "r", encoding="utf-8") as f:
        client = json.load(f)["installed"]

    print("Scope requested: spreadsheets.readonly (roster read only)")
    print(f"OAuth client project: {client['project_id']}")
    print("A browser window will open for Google consent.")
    input("Press Enter to open the browser...")

    flow = InstalledAppFlow.from_client_secrets_file(CLIENT_FILE, SCOPES)
    creds = flow.run_local_server(port=8080, prompt="consent", access_type="offline")

    if not creds.refresh_token:
        raise SystemExit(
            "No refresh token received. In Google Cloud Console -> OAuth consent "
            "screen, ensure your account is a test user (Testing mode) or the app "
            "is published, then re-run."
        )

    upsert_env(OUT_FILE, {
        "GOOGLE_CLIENT_ID": client["client_id"],
        "GOOGLE_CLIENT_SECRET": client["client_secret"],
        "GOOGLE_REFRESH_TOKEN": creds.refresh_token,
    })
    # Confirmation only — no secret values printed.
    print("\nOK: wrote GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN "
          f"to {OUT_FILE} (values not shown).")


if __name__ == "__main__":
    main()
