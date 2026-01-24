import asyncio
import socket
from zeroconf.asyncio import AsyncZeroconf, AsyncServiceBrowser, AsyncServiceInfo
from zeroconf import ServiceListener

class MyListener(ServiceListener):
    def add_service(self, zc, type_, name):
        asyncio.create_task(self.print_info(zc, type_, name))

    def update_service(self, zc, type_, name):
        asyncio.create_task(self.print_info(zc, type_, name))

    def remove_service(self, zc, type_, name):
        print(f"Service removed: {name}")

    async def print_info(self, zc, type_, name):
        info = AsyncServiceInfo(type_, name)
        await info.async_request(zc, 3000) # 3 second timeout
        
        if info:
            addresses = [socket.inet_ntoa(addr) for addr in info.addresses]
            print("\n--- Found Service ---")
            print(f"Server name: {name.split('.')[0]}")
            print(f"IP: {addresses}")
            print(f"Port: {info.port}")
            if info.properties:
                print(f"Properties: {info.properties}")
        else:
            print(f"Could not resolve details for {name}")

async def main():
    aiozc = AsyncZeroconf()
    listener = MyListener()
    print("Searching for _vocalink._tcp.local... (Press Ctrl+C to stop)")
    AsyncServiceBrowser(aiozc.zeroconf, "_vocalink._tcp.local.", listener)
    
    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping browser...")
    finally:
        await aiozc.async_close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
