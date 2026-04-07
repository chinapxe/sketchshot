import os
import shutil
import tempfile
import unittest
from pathlib import Path

os.environ["DEBUG"] = "false"

from backend.app.models.schemas import UserTemplateSaveRequest, WorkflowEdge, WorkflowNode
from backend.app.services.template_service import TemplateService


class TemplateServiceRoundTripTests(unittest.TestCase):
    def setUp(self):
        self._temp_dir = Path(tempfile.mkdtemp(prefix="wxhb-templates-"))
        self.service = TemplateService()
        self.service._storage_dir = self._temp_dir
        self.service._storage_dir.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self._temp_dir, ignore_errors=True)

    def test_save_and_load_user_template(self):
        request = UserTemplateSaveRequest(
            name="我的三镜头模板",
            nodes=[
                WorkflowNode(
                    id="scene-1",
                    type="scene",
                    position={"x": 80, "y": 120},
                    data={
                        "label": "场次",
                        "title": "屋顶对峙",
                    },
                ),
                WorkflowNode(
                    id="shot-1",
                    type="shot",
                    position={"x": 420, "y": 120},
                    data={
                        "label": "镜头 01",
                        "title": "回头特写",
                        "description": "主角停下脚步后回头",
                        "outputType": "image",
                    },
                ),
            ],
            edges=[
                WorkflowEdge(id="edge-1", source="scene-1", target="shot-1"),
            ],
        )

        saved = self.service.save(request)
        loaded = self.service.get(saved.id)
        listed = self.service.list_all()

        self.assertIsNotNone(loaded)
        self.assertEqual(saved.name, "我的三镜头模板")
        self.assertEqual(loaded.name, "我的三镜头模板")
        self.assertEqual(len(loaded.nodes), 2)
        self.assertEqual(len(loaded.edges), 1)
        self.assertEqual(loaded.nodes[1].data["title"], "回头特写")
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0].node_count, 2)


if __name__ == "__main__":
    unittest.main()
