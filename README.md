> VocalLink - A distributed voice capturing system

[Read notes](NOTES.md)

#### setup

**NOTE:** python, pip and git should be installed.

```bash
git clone https://github.com/0x11a41/mini-project 
cd mini-project/docs/example

python -m venv venv
source venv/bin/active
pip install -r requirements.txt
```

#### running the server

```bash
uvicorn main:app --host 0.0.0.0 --port 6210
```
