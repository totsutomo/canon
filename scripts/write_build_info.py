"""デプロイ時に build_info.txt を書き出す。"""
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def main():
    try:
        stamp = subprocess.run(
            ["git", "log", "-1", "--format=%cI"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        stamp = ""
    if not stamp:
        stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    Path(__file__).resolve().parent.parent.joinpath("build_info.txt").write_text(stamp, encoding="utf-8")
    print(f"build_info.txt: {stamp}")


if __name__ == "__main__":
    main()
