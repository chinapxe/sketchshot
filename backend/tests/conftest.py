"""pytest configuration for backend tests."""
import pytest


def pytest_configure(config: pytest.Config) -> None:
    """Register custom markers."""
    config.addinivalue_line("markers", "asyncio: mark test as async")
