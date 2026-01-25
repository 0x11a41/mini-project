import asyncio
import httpx
import ipaddress
import socket

PORT = 6210
ENDPOINT = "/ping"
EXPECTED_JSON = {"_VOCAL_LINK_SERVER_": "running"}
TIMEOUT = 0.5 
CONCURRENCY_LIMIT = 256 

semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)

async def check_device(client, ip):
    async with semaphore:
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, PORT), 
                timeout=0.2 # Ultra-short timeout just for the handshake
            )
            writer.close()
            await writer.wait_closed()
        except (OSError, asyncio.TimeoutError):
            return None

        # If port is open, NOW we do the heavy HTTP work
        url = f"http://{ip}:{PORT}{ENDPOINT}"
        try:
            response = await client.get(url, timeout=TIMEOUT)
            if response.status_code == 200:
                data = response.json()
                if data == EXPECTED_JSON:
                    return ip
        except Exception:
            pass
        return None

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('8.8.8.8', 1))
        ip = s.getsockname()[0]
    except Exception:
        ip = '127.0.0.1'
    finally:
        s.close()
    return ip

async def scan_network():
    local_ip = get_local_ip()
    if local_ip.startswith('127.'):
        print("Error: Scanning loopback. Connect to a network.")
        return []

    interface = ipaddress.IPv4Interface(f"{local_ip}/24")
    network = interface.network
    print(f"Fast-Scanning Subnet: {network} ({network.num_addresses} addresses)")
    limits = httpx.Limits(max_keepalive_connections=0, max_connections=CONCURRENCY_LIMIT)
    
    async with httpx.AsyncClient(verify=False, limits=limits) as client:
        tasks = [check_device(client, str(ip)) for ip in network.hosts()]
        # Run them all at once
        results = await asyncio.gather(*tasks)
        
    return [ip for ip in results if ip]

if __name__ == "__main__":
    import time
    start = time.time()
    
    servers = asyncio.run(scan_network())
    
    duration = time.time() - start
    print(f"\nScan Complete in {duration:.2f} seconds.")
    print(f"Found {len(servers)} servers:")
    for s in servers:
        print(f"-> {s}")
