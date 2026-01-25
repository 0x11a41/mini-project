> vocal-link-dashboard - Controller for vocal-link-recorder

[Read notes](docs/NOTES.md)

### setup

**Prerequesites:** python, pip and git should be installed.

```bash
git clone https://github.com/0x11a41/vocal-link 
cd vocal-link

python -m venv venv
source venv/bin/active
pip install -r requirements.txt
```

### running the server

```bash
uvicorn main:app --host 0.0.0.0 --port 6210
```
