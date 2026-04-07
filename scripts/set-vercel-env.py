"""
Sets all environment variables from .env.local to the Vercel project.
Run from the project root: python scripts/set-vercel-env.py

Requires: Vercel CLI installed and authenticated (vercel login)
"""

import subprocess
import sys
from pathlib import Path

ENV_KEYS = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
]

ENVIRONMENTS = ["production", "preview", "development"]


def parse_env_file(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        # Strip inline comments (only if value is unquoted)
        if not value.startswith(("'", '"')):
            value = value.split("#")[0].strip()
        values[key] = value
    return values


def set_env_var(name: str, value: str) -> bool:
    if not value:
        print(f"  SKIP  {name} (empty value)")
        return True

    failed = []
    for env in ENVIRONMENTS:
        cmd = f'vercel env add {name} {env} --yes --force'
        result = subprocess.run(
            cmd,
            input=value,
            text=True,
            capture_output=True,
            shell=True,
        )
        if result.returncode != 0:
            failed.append(f"{env}: {result.stderr.strip()}")

    if failed:
        print(f"  FAIL  {name}: {'; '.join(failed)}")
        return False
    print(f"  OK    {name}")
    return True


def main():
    env_file = Path(".env.local")
    if not env_file.exists():
        print("Error: .env.local not found. Run from the project root.")
        sys.exit(1)

    env_values = parse_env_file(env_file)
    missing = [k for k in ENV_KEYS if k not in env_values]
    if missing:
        print(f"Warning: missing from .env.local: {', '.join(missing)}")

    print(f"Setting {len(ENV_KEYS)} env vars on Vercel ({', '.join(ENVIRONMENTS)})...\n")
    failures = []
    for key in ENV_KEYS:
        value = env_values.get(key, "")
        if not set_env_var(key, value):
            failures.append(key)

    print()
    if failures:
        print(f"Done with errors. Failed: {', '.join(failures)}")
        sys.exit(1)
    else:
        print("All environment variables set successfully.")


if __name__ == "__main__":
    main()
