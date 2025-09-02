#!/usr/bin/env python3
"""
WebRTC Connection Analyzer
Analyzes WebRTC connection quality and provides optimization recommendations
"""

import json
import asyncio
import websockets
import time
from datetime import datetime
from typing import Dict, List, Optional

class WebRTCAnalyzer:
    def __init__(self, websocket_url: str = "ws://localhost:9000"):
        self.websocket_url = websocket_url
        self.connection_data = []
        self.ice_candidates = []
        self.connection_states = []
        
    async def connect_and_analyze(self, duration: int = 30):
        """Connect to WebSocket server and analyze WebRTC performance"""
        print(f"🔍 Analyzing WebRTC performance for {duration} seconds...")
        
        try:
            async with websockets.connect(self.websocket_url) as websocket:
                # Send test messages
                test_session_id = f"test_{int(time.time())}"
                
                await websocket.send(json.dumps({
                    "t": "host-ready",
                    "s": test_session_id
                }))
                
                start_time = time.time()
                message_count = 0
                
                while time.time() - start_time < duration:
                    try:
                        # Send periodic test messages
                        await websocket.send(json.dumps({
                            "t": "stats",
                            "s": test_session_id,
                            "d": {
                                "timestamp": time.time(),
                                "test_data": "performance_test"
                            }
                        }))
                        
                        # Try to receive messages
                        message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                        message_count += 1
                        
                        # Parse and store message data
                        try:
                            data = json.loads(message)
                            self.connection_data.append({
                                "timestamp": time.time(),
                                "message_type": data.get("t"),
                                "data": data
                            })
                        except json.JSONDecodeError:
                            pass
                            
                    except asyncio.TimeoutError:
                        # No message received, continue
                        pass
                    
                    await asyncio.sleep(0.1)
                
                print(f"✅ Analysis complete. Processed {message_count} messages.")
                
        except Exception as e:
            print(f"❌ Connection failed: {e}")
            return False
        
        return True
    
    def analyze_performance(self) -> Dict:
        """Analyze collected performance data"""
        if not self.connection_data:
            return {"error": "No data collected"}
        
        analysis = {
            "total_messages": len(self.connection_data),
            "message_types": {},
            "connection_quality": "unknown",
            "recommendations": [],
            "timestamps": {
                "start": min(d["timestamp"] for d in self.connection_data),
                "end": max(d["timestamp"] for d in self.connection_data),
                "duration": 0
            }
        }
        
        # Calculate duration
        analysis["timestamps"]["duration"] = (
            analysis["timestamps"]["end"] - analysis["timestamps"]["start"]
        )
        
        # Count message types
        for data in self.connection_data:
            msg_type = data.get("message_type", "unknown")
            analysis["message_types"][msg_type] = analysis["message_types"].get(msg_type, 0) + 1
        
        # Analyze message frequency
        if analysis["timestamps"]["duration"] > 0:
            msg_per_second = analysis["total_messages"] / analysis["timestamps"]["duration"]
            
            if msg_per_second > 10:
                analysis["connection_quality"] = "excellent"
            elif msg_per_second > 5:
                analysis["connection_quality"] = "good"
            elif msg_per_second > 1:
                analysis["connection_quality"] = "fair"
            else:
                analysis["connection_quality"] = "poor"
                analysis["recommendations"].append("Low message throughput detected")
        
        # Add recommendations based on analysis
        if analysis["total_messages"] < 10:
            analysis["recommendations"].append("Very few messages exchanged - check server connectivity")
        
        if "error" in analysis["message_types"]:
            analysis["recommendations"].append("Error messages detected - check server logs")
        
        return analysis
    
    def generate_report(self) -> str:
        """Generate a detailed analysis report"""
        analysis = self.analyze_performance()
        
        report = f"""
🔍 WebRTC Connection Analysis Report
Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
{'='*50}

📊 Connection Statistics:
  • Total Messages: {analysis.get('total_messages', 0)}
  • Duration: {analysis.get('timestamps', {}).get('duration', 0):.2f} seconds
  • Quality: {analysis.get('connection_quality', 'unknown').upper()}

📈 Message Types:
"""
        
        for msg_type, count in analysis.get("message_types", {}).items():
            report += f"  • {msg_type}: {count}\n"
        
        if analysis.get("recommendations"):
            report += "\n💡 Recommendations:\n"
            for rec in analysis["recommendations"]:
                report += f"  • {rec}\n"
        
        return report

async def main():
    analyzer = WebRTCAnalyzer()
    
    print("🚀 Starting WebRTC Analysis...")
    success = await analyzer.connect_and_analyze(duration=15)
    
    if success:
        report = analyzer.generate_report()
        print(report)
        
        # Save report to file
        with open("webrtc_analysis.txt", "w") as f:
            f.write(report)
        print("💾 Report saved to webrtc_analysis.txt")
    else:
        print("❌ Analysis failed - make sure the WebSocket server is running")

if __name__ == "__main__":
    asyncio.run(main())
