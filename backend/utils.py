import random

def getRandomName(file_path="backend/server_names.txt") -> str:
    with open(file_path, "r", encoding="utf-8") as f:
        names = [line.strip() for line in f if line.strip()]
    if not names:
        return "VLServer"
    return random.choice(names)
