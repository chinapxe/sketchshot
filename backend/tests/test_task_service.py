import os
import unittest

os.environ["DEBUG"] = "false"

from backend.app.adapters.base import BaseAdapter, GenerateParams, ProgressUpdate
from backend.app.adapters.registry import adapter_registry
from backend.app.config import settings
from backend.app.services.task_service import TaskService


class DummyAdapter(BaseAdapter):
    def __init__(self, adapter_name: str):
        self._adapter_name = adapter_name

    @property
    def name(self) -> str:
        return self._adapter_name

    async def generate(self, params: GenerateParams):
        yield ProgressUpdate(progress=100, status="success", message="ok")


class TaskServiceTests(unittest.TestCase):
    def setUp(self):
        self._original_adapters = dict(adapter_registry._adapters)
        self._original_default_adapter = settings.DEFAULT_ADAPTER
        adapter_registry._adapters = {}

    def tearDown(self):
        adapter_registry._adapters = self._original_adapters
        settings.DEFAULT_ADAPTER = self._original_default_adapter

    def test_auto_uses_configured_default_adapter_even_before_registry_fallback(self):
        settings.DEFAULT_ADAPTER = "volcengine"
        adapter_registry.register(DummyAdapter("mock"))
        adapter_registry.register(DummyAdapter("volcengine"))

        service = TaskService()

        self.assertEqual(service._resolve_adapter_name("auto"), "volcengine")

    def test_auto_respects_explicit_default_even_if_adapter_is_not_registered(self):
        settings.DEFAULT_ADAPTER = "volcengine"
        adapter_registry.register(DummyAdapter("mock"))

        service = TaskService()

        self.assertEqual(service._resolve_adapter_name("auto"), "volcengine")


if __name__ == "__main__":
    unittest.main()
