"""
适配器注册中心 - 管理所有可用的模型适配器
"""
import logging
from typing import Optional
from .base import BaseAdapter

logger = logging.getLogger(__name__)


class AdapterRegistry:
    """
    模型适配器注册中心
    新增模型只需调用 register() 注册即可
    """

    def __init__(self):
        self._adapters: dict[str, BaseAdapter] = {}

    def register(self, adapter: BaseAdapter) -> None:
        """注册适配器"""
        name = adapter.name
        if name in self._adapters:
            logger.warning(f"[AdapterRegistry] 适配器 '{name}' 已存在，将被覆盖")
        self._adapters[name] = adapter
        logger.info(f"[AdapterRegistry] 注册适配器: {name}")

    def get(self, name: str) -> Optional[BaseAdapter]:
        """获取适配器"""
        return self._adapters.get(name)

    def list_adapters(self) -> list[str]:
        """列出所有已注册的适配器名称"""
        return list(self._adapters.keys())


# 全局单例
adapter_registry = AdapterRegistry()

