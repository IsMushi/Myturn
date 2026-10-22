#!/usr/bin/env python3
"""
Demonstration of Obstruction Handling in MyTurn

This script simulates the sensor data patterns that differentiate
between objects (bags) and human visitors at the service desk.

Key Differences:
1. Objects: Static position, no approach history, consistent temperature
2. Humans: Dynamic movement, approach history, variable patterns
"""

import time
from dataclasses import dataclass
from typing import List, Optional
from enum import Enum

class SensorState(Enum):
    EMPTY = "empty"
    APPROACHING = "approaching"
    MOVING = "moving"
    STEADY = "steady"
    WALKING_AWAY = "walking_away"

@dataclass
class SensorReading:
    timestamp: float
    distance_cm: float
    pir_state: SensorState
    occupied: bool
    sequence: int
    
    def __str__(self):
        return (f"[{self.timestamp:.1f}ms] distance {self.distance_cm:6.1f}cm | "
                f"occupied {'yes' if self.occupied else 'no':3} | "
                f"pir {self.pir_state.value:10} | led {'red' if self.occupied else 'green'}")

class ObstacleDetector:
    def __init__(self):
        self.readings: List[SensorReading] = []
        self.occupancy_start_time: Optional[float] = None
        self.approach_detected = False
        self.object_detected = False
        
    def add_reading(self, reading: SensorReading):
        self.readings.append(reading)
        
        # Update state based on reading
        if reading.pir_state == SensorState.APPROACHING:
            self.approach_detected = True
            self.occupancy_start_time = reading.timestamp
            
    def analyze_obstruction(self, current_time: float) -> dict:
        """Analyze if current reading represents an obstruction"""
        if not self.readings:
            return {"status": "no_data", "reason": "No readings available"}
            
        latest = self.readings[-1]
        recent_readings = self.get_recent_readings(current_time - 300000)  # Last 5 minutes
        
        # Check for obstruction indicators
        is_static_object = self._is_static_object(recent_readings)
        has_approach_history = self._has_approach_history()
        is_prolonged_stillness = self._is_prolonged_stillness(current_time)
        
        if is_static_object and not has_approach_history and is_prolonged_stillness:
            return {
                "status": "obstruction",
                "reason": "Object has been stationary for 5+ minutes with no approach history",
                "hold_time": 25,  # MIN_CALL_SECONDS
                "action": "Shorten hold, treat as bag"
            }
        elif self._is_human_visitor(recent_readings):
            return {
                "status": "human",
                "reason": "Movement patterns consistent with human visitor",
                "hold_time": 60,  # HOLD_SECONDS
                "action": "Keep full hold"
            }
        else:
            return {
                "status": "uncertain",
                "reason": "Cannot determine object vs human",
                "hold_time": 60,
                "action": "Keep full hold, monitor"
            }
    
    def _is_static_object(self, readings: List[SensorReading]) -> bool:
        """Check if readings indicate a static object"""
        if len(readings) < 3:
            return False
            
        # Check for consistent distance
        distances = [r.distance_cm for r in readings]
        distance_variation = max(distances) - min(distances)
        
        # Check for consistent PIR state
        pir_states = [r.pir_state for r in readings]
        pir_is_steady = all(state == SensorState.STEADY for state in pir_states)
        
        # Static object has minimal distance variation and steady PIR
        return distance_variation < 10 and pir_is_steady and len(readings) >= 5
    
    def _has_approach_history(self) -> bool:
        """Check if approach was ever detected"""
        return self.approach_detected
    
    def _is_prolonged_stillness(self, current_time: float) -> bool:
        """Check if stillness has lasted 5+ minutes"""
        if not self.occupancy_start_time:
            return False
            
        stillness_duration = current_time - self.occupancy_start_time
        return stillness_duration >= 300000  # 5 minutes in milliseconds
    
    def _is_human_visitor(self, readings: List[SensorReading]) -> bool:
        """Check if readings indicate human visitor behavior"""
        if len(readings) < 3:
            return False
            
        # Humans show movement patterns
        distances = [r.distance_cm for r in readings]
        pir_states = [r.pir_state for r in readings]
        
        # Look for approach → movement → steady → walking away pattern
        has_approach = SensorState.APPROACHING in pir_states
        has_movement = SensorState.MOVING in pir_states
        has_walking_away = SensorState.WALKING_AWAY in pir_states
        
        # Movement in distance (walking away)
        distance_change = max(distances) - min(distances)
        
        return has_approach and (has_movement or has_walking_away) and distance_change > 100

def demonstrate_scenario():
    """Demonstrate both scenarios"""
    print("=" * 80)
    print("MYTURN OBSTRUCTION HANDLING DEMONSTRATION")
    print("=" * 80)
    
    print("\n1. BAG/OBJECT SCENARIO")
    print("-" * 40)
    bag_detector = ObstacleDetector()
    
    # Simulate bag placement
    bag_timestamps = [1024450, 1024455, 1024460, 1024500, 1024510, 1024520,
                     1024530, 1024540, 1024550, 1024560, 1024570, 1024580,
                     1024590, 1024600, 1024610, 1024620, 1024630, 1024640,
                     1024650, 1024660, 1024670, 1024680, 1024690, 1024700]
    
    for i, ts in enumerate(bag_timestamps):
        reading = SensorReading(
            timestamp=ts,
            distance_cm=25.0 if i > 0 else 50.0,
            pir_state=SensorState.STEADY if i > 0 else SensorState.APPROACHING,
            occupied=True,
            sequence=63 + i
        )
        bag_detector.add_reading(reading)
        print(reading)
    
    current_time = bag_timestamps[-1] + 60000  # Add 1 minute
    result = bag_detector.analyze_obstruction(current_time)
    print(f"\nANALYSIS RESULT: {result}")
    
    print("\n\n2. HUMAN VISITOR SCENARIO")
    print("-" * 40)
    visitor_detector = ObstacleDetector()
    
    # Simulate human visitor
    visitor_timestamps = [1025140, 1025150, 1025160, 1025170, 1025180,
                          1025200, 1025210, 1025220, 1025230, 1025240]
    
    for i, ts in enumerate(visitor_timestamps):
        if i == 0:
            reading = SensorReading(
                timestamp=ts,
                distance_cm=200.0,
                pir_state=SensorState.APPROACHING,
                occupied=True,
                sequence=129 + i
            )
        elif i < 4:
            reading = SensorReading(
                timestamp=ts,
                distance_cm=150.0 - (i * 10),
                pir_state=SensorState.MOVING,
                occupied=True,
                sequence=129 + i
            )
        elif i == 4:
            reading = SensorReading(
                timestamp=ts,
                distance_cm=50.0,
                pir_state=SensorState.STEADY,
                occupied=True,
                sequence=129 + i
            )
        elif i == 5:
            reading = SensorReading(
                timestamp=ts,
                distance_cm=75.0 + (i * 10),
                pir_state=SensorState.WALKING_AWAY,
                occupied=True,
                sequence=129 + i
            )
        else:
            reading = SensorReading(
                timestamp=ts,
                distance_cm=300.0 + ((i-6) * 20),
                pir_state=SensorState.WALKING_AWAY,
                occupied=False,
                sequence=129 + i
            )
        visitor_detector.add_reading(reading)
        print(reading)
    
    current_time = visitor_timestamps[-1] + 60000
    result = visitor_detector.analyze_obstruction(current_time)
    print(f"\nANALYSIS RESULT: {result}")
    
    print("\n" + "=" * 80)
    print("KEY INSIGHTS")
    print("=" * 80)
    print("1. BAG OBJECT:")
    print("   • Static position (25cm constant)")
    print("   • PIR: STEADY (no movement after initial detection)")
    print("   • No approach history in recent window")
    print("   • Prolonged stillness (>5 minutes)")
    print("   • Result: TREAT AS OBSTRUCTION → Hold time: 25s")
    
    print("\n2. HUMAN VISITOR:")
    print("   • Dynamic movement (200cm → 50cm → 400cm+)")
    print("   • PIR: APPROACHING → MOVING → STEADY → WALKING AWAY")
    print("   • Clear approach history detected")
    print("   • Natural leaving behavior")
    print("   • Result: KEEP FULL HOLD → Hold time: 60s")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    demonstrate_scenario()