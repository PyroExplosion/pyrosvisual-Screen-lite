#!/usr/bin/env python3
"""
Advanced Network Performance Monitor
Monitors network latency, bandwidth, and connection quality in real-time
Perfect for testing remote desktop performance
"""

import asyncio
import json
import time
import statistics
import subprocess
import platform
import socket
import threading
from datetime import datetime
from typing import Dict, List, Optional
import argparse

class NetworkMonitor:
    def __init__(self, targets: List[str] = None, interval: float = 1.0):
        self.targets = targets or [
            "8.8.8.8",  # Google DNS
            "1.1.1.1",  # Cloudflare DNS
            "stun.l.google.com",  # STUN server
            "localhost"  # Local server
        ]
        self.interval = interval
        self.results = []
        self.running = False
        self.stats = {
            "total_tests": 0,
            "successful_pings": 0,
            "failed_pings": 0,
            "avg_latency": 0,
            "min_latency": float('inf'),
            "max_latency": 0,
            "packet_loss": 0
        }

    async def ping_host(self, host: str, timeout: float = 3.0) -> Optional[float]:
        """Ping a host and return latency in milliseconds"""
        try:
            system = platform.system().lower()
            
            if system == "windows":
                cmd = ["ping", "-n", "1", "-w", str(int(timeout * 1000)), host]
            else:
                cmd = ["ping", "-c", "1", "-W", str(int(timeout)), host]
            
            start_time = time.time()
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(), 
                timeout=timeout
            )
            
            if process.returncode == 0:
                latency = (time.time() - start_time) * 1000
                return latency
            else:
                return None
                
        except (asyncio.TimeoutError, Exception) as e:
            print(f"❌ Ping failed for {host}: {e}")
            return None

    async def test_tcp_connection(self, host: str, port: int = 80, timeout: float = 3.0) -> Optional[float]:
        """Test TCP connection speed"""
        try:
            start_time = time.time()
            
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(host, port),
                timeout=timeout
            )
            
            latency = (time.time() - start_time) * 1000
            writer.close()
            await writer.wait_closed()
            
            return latency
            
        except Exception as e:
            print(f"❌ TCP connection failed for {host}:{port}: {e}")
            return None

    async def measure_bandwidth(self, host: str = "httpbin.org", size_kb: int = 100) -> Optional[float]:
        """Estimate download bandwidth"""
        try:
            import aiohttp
            
            url = f"https://{host}/bytes/{size_kb * 1024}"
            start_time = time.time()
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as response:
                    data = await response.read()
                    
            duration = time.time() - start_time
            bandwidth_kbps = (len(data) * 8) / (duration * 1000)  # Kbps
            
            return bandwidth_kbps
            
        except Exception as e:
            print(f"❌ Bandwidth test failed: {e}")
            return None

    async def run_comprehensive_test(self) -> Dict:
        """Run all network tests"""
        timestamp = datetime.now().isoformat()
        test_results = {
            "timestamp": timestamp,
            "ping_results": {},
            "tcp_results": {},
            "bandwidth": None,
            "dns_resolution": {}
        }
        
        # Ping tests
        ping_tasks = [self.ping_host(target) for target in self.targets]
        ping_results = await asyncio.gather(*ping_tasks, return_exceptions=True)
        
        for target, result in zip(self.targets, ping_results):
            if isinstance(result, Exception):
                test_results["ping_results"][target] = None
                self.stats["failed_pings"] += 1
            else:
                test_results["ping_results"][target] = result
                if result is not None:
                    self.stats["successful_pings"] += 1
                    self.stats["min_latency"] = min(self.stats["min_latency"], result)
                    self.stats["max_latency"] = max(self.stats["max_latency"], result)
                else:
                    self.stats["failed_pings"] += 1
        
        # TCP connection tests
        tcp_targets = [
            ("google.com", 80),
            ("github.com", 443),
            ("localhost", 9000)  # Our WebSocket server
        ]
        
        for host, port in tcp_targets:
            tcp_result = await self.test_tcp_connection(host, port)
            test_results["tcp_results"][f"{host}:{port}"] = tcp_result
        
        # Bandwidth test
        bandwidth = await self.measure_bandwidth()
        test_results["bandwidth"] = bandwidth
        
        # DNS resolution test
        for target in self.targets[:2]:  # Test first 2 targets
            try:
                start_time = time.time()
                socket.gethostbyname(target)
                dns_time = (time.time() - start_time) * 1000
                test_results["dns_resolution"][target] = dns_time
            except Exception:
                test_results["dns_resolution"][target] = None
        
        self.stats["total_tests"] += 1
        self.results.append(test_results)
        
        # Calculate average latency
        valid_pings = [r for r in ping_results if r is not None and not isinstance(r, Exception)]
        if valid_pings:
            self.stats["avg_latency"] = statistics.mean(valid_pings)
        
        # Calculate packet loss
        if self.stats["total_tests"] > 0:
            total_pings = self.stats["successful_pings"] + self.stats["failed_pings"]
            self.stats["packet_loss"] = (self.stats["failed_pings"] / total_pings) * 100 if total_pings > 0 else 0
        
        return test_results

    def print_results(self, results: Dict):
        """Print formatted test results"""
        print(f"\n🔍 Network Test Results - {results['timestamp']}")
        print("=" * 60)
        
        # Ping results
        print("📡 Ping Results:")
        for target, latency in results["ping_results"].items():
            if latency is not None:
                status = "🟢" if latency < 50 else "🟡" if latency < 100 else "🔴"
                print(f"  {status} {target:<20} {latency:.1f}ms")
            else:
                print(f"  🔴 {target:<20} TIMEOUT")
        
        # TCP results
        print("\n🔌 TCP Connection Results:")
        for target, latency in results["tcp_results"].items():
            if latency is not None:
                status = "🟢" if latency < 100 else "🟡" if latency < 200 else "🔴"
                print(f"  {status} {target:<20} {latency:.1f}ms")
            else:
                print(f"  🔴 {target:<20} FAILED")
        
        # Bandwidth
        if results["bandwidth"]:
            bandwidth_mbps = results["bandwidth"] / 1000
            status = "🟢" if bandwidth_mbps > 10 else "🟡" if bandwidth_mbps > 1 else "🔴"
            print(f"\n📊 Bandwidth: {status} {bandwidth_mbps:.2f} Mbps")
        
        # DNS resolution
        print("\n🌐 DNS Resolution:")
        for target, dns_time in results["dns_resolution"].items():
            if dns_time is not None:
                status = "🟢" if dns_time < 50 else "🟡" if dns_time < 100 else "🔴"
                print(f"  {status} {target:<20} {dns_time:.1f}ms")
            else:
                print(f"  🔴 {target:<20} FAILED")

    def print_summary(self):
        """Print overall statistics"""
        print(f"\n📈 Summary Statistics:")
        print("=" * 40)
        print(f"Total Tests: {self.stats['total_tests']}")
        print(f"Successful Pings: {self.stats['successful_pings']}")
        print(f"Failed Pings: {self.stats['failed_pings']}")
        print(f"Packet Loss: {self.stats['packet_loss']:.1f}%")
        
        if self.stats['min_latency'] != float('inf'):
            print(f"Min Latency: {self.stats['min_latency']:.1f}ms")
            print(f"Avg Latency: {self.stats['avg_latency']:.1f}ms")
            print(f"Max Latency: {self.stats['max_latency']:.1f}ms")

    async def continuous_monitor(self, duration: Optional[int] = None):
        """Run continuous monitoring"""
        self.running = True
        start_time = time.time()
        
        print("🚀 Starting Network Performance Monitor")
        print(f"📊 Testing every {self.interval} seconds")
        print("Press Ctrl+C to stop\n")
        
        try:
            while self.running:
                if duration and (time.time() - start_time) > duration:
                    break
                
                results = await self.run_comprehensive_test()
                self.print_results(results)
                
                await asyncio.sleep(self.interval)
                
        except KeyboardInterrupt:
            print("\n⏹️  Monitoring stopped by user")
        finally:
            self.running = False
            self.print_summary()

    def save_results(self, filename: str = "network_results.json"):
        """Save results to JSON file"""
        with open(filename, 'w') as f:
            json.dump({
                "results": self.results,
                "stats": self.stats,
                "generated_at": datetime.now().isoformat()
            }, f, indent=2)
        print(f"💾 Results saved to {filename}")

    def analyze_remote_desktop_readiness(self) -> Dict[str, str]:
        """Analyze if network is suitable for remote desktop"""
        analysis = {
            "overall": "unknown",
            "latency": "unknown",
            "stability": "unknown",
            "bandwidth": "unknown",
            "recommendations": []
        }
        
        if self.stats["avg_latency"] > 0:
            if self.stats["avg_latency"] < 50:
                analysis["latency"] = "excellent"
            elif self.stats["avg_latency"] < 100:
                analysis["latency"] = "good"
            elif self.stats["avg_latency"] < 200:
                analysis["latency"] = "fair"
            else:
                analysis["latency"] = "poor"
                analysis["recommendations"].append("High latency detected. Consider using wired connection.")
        
        if self.stats["packet_loss"] < 1:
            analysis["stability"] = "excellent"
        elif self.stats["packet_loss"] < 3:
            analysis["stability"] = "good"
        elif self.stats["packet_loss"] < 5:
            analysis["stability"] = "fair"
        else:
            analysis["stability"] = "poor"
            analysis["recommendations"].append("High packet loss detected. Check network stability.")
        
        # Overall assessment
        if analysis["latency"] in ["excellent", "good"] and analysis["stability"] in ["excellent", "good"]:
            analysis["overall"] = "ready"
        elif analysis["latency"] == "fair" or analysis["stability"] == "fair":
            analysis["overall"] = "marginal"
        else:
            analysis["overall"] = "not_ready"
        
        return analysis

async def main():
    parser = argparse.ArgumentParser(description="Network Performance Monitor for Remote Desktop")
    parser.add_argument("--targets", nargs="+", help="Target hosts to ping")
    parser.add_argument("--interval", type=float, default=2.0, help="Test interval in seconds")
    parser.add_argument("--duration", type=int, help="Test duration in seconds")
    parser.add_argument("--output", help="Output file for results")
    parser.add_argument("--single", action="store_true", help="Run single test instead of continuous")
    
    args = parser.parse_args()
    
    monitor = NetworkMonitor(
        targets=args.targets,
        interval=args.interval
    )
    
    if args.single:
        print("🔍 Running single network test...")
        results = await monitor.run_comprehensive_test()
        monitor.print_results(results)
        
        analysis = monitor.analyze_remote_desktop_readiness()
        print(f"\n🎯 Remote Desktop Readiness: {analysis['overall'].upper()}")
        
        if analysis["recommendations"]:
            print("💡 Recommendations:")
            for rec in analysis["recommendations"]:
                print(f"  • {rec}")
    else:
        await monitor.continuous_monitor(duration=args.duration)
    
    if args.output:
        monitor.save_results(args.output)

if __name__ == "__main__":
    # Install required dependency
    try:
        import aiohttp
    except ImportError:
        print("Installing required dependency...")
        subprocess.check_call(["pip", "install", "aiohttp"])
        import aiohttp
    
    asyncio.run(main())
