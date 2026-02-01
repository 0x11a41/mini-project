import subprocess
import threading
import webbrowser
import time
import os
import signal
import sys
import argparse
from livereload import Server


# -----------------------
# Configuration
# -----------------------

BACKEND_CMD = [ "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "6210" ]
HOST = "127.0.0.1"
PORT = 6381
URL = f"http://{HOST}:{PORT}"
STARTUP_DELAY = 3


# -----------------------
# CLI Arguments
# -----------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Run VocalLink frontend/backend dev servers"
    )

    parser.add_argument(
        "--backend",
        action="store_true",
        help="Run backend only"
    )

    parser.add_argument(
        "--frontend",
        action="store_true",
        help="Run frontend only"
    )

    parser.add_argument(
        "--both",
        action="store_true",
        help="Run both frontend and backend (default)"
    )

    return parser.parse_args()


# -----------------------
# Utilities
# -----------------------

def open_browser():
    time.sleep(STARTUP_DELAY)
    print(f"Opening browser to {URL}...")
    webbrowser.open(URL)


def start_backend():
    print("[*] Starting backend...")
    return subprocess.Popen(
        BACKEND_CMD,
        start_new_session=True
    )


def cleanup(proc):
    print("\n[!] Shutting down servers...")

    if proc is None:
        return

    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
        proc.wait(timeout=5)
    except Exception as e:
        print(f"[!] Error stopping backend: {e}")


# -----------------------
# Main
# -----------------------

def main():
    args = parse_args()

    # Default: both
    run_backend = args.backend or args.both or not args.frontend
    run_frontend = args.frontend or args.both or not args.backend


    backend_process = None


    # Start backend
    if run_backend:
        backend_process = start_backend()


    # Start browser only if frontend is running
    if run_frontend:
        threading.Thread(
            target=open_browser,
            daemon=True
        ).start()


    # Start frontend
    if run_frontend:
        server = Server()
        server.watch(
            "frontend/", 
            ignore=lambda x: "frontend/scripts/src" in x or x.endswith(".ts")
        )

        try:
            print(f"[*] Frontend running at {URL}")
            server.serve(
                root="frontend",
                host=HOST,
                port=PORT
            )

        except KeyboardInterrupt:
            print("\n[!] Manual shutdown detected.")

        except Exception as e:
            print(f"\n[X] CRITICAL ERROR: {e}")
            import traceback
            traceback.print_exc()

        finally:
            cleanup(backend_process)
            sys.exit(0)

    else:
        # Backend only → wait
        try:
            print("[*] Backend running. Press Ctrl+C to stop.")
            backend_process.wait()

        except KeyboardInterrupt:
            print("\n[!] Manual shutdown detected.")
            cleanup(backend_process)


# -----------------------

if __name__ == "__main__":
    main()

