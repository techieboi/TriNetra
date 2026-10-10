import asyncio
from typing import Callable, List, Any
from app.schema import Event

class EventBus:
    def __init__(self):
        self.queue: asyncio.Queue = asyncio.Queue()
        self.subscribers: List[Callable[[Event], Any]] = []

    async def publish(self, event: Event):
        await self.queue.put(event)

    def subscribe(self, callback: Callable[[Event], Any]):
        self.subscribers.append(callback)

bus = EventBus()
