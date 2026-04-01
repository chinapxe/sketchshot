import os
import shutil
import tempfile
import unittest
from pathlib import Path

os.environ["DEBUG"] = "false"

from backend.app.models.schemas import WorkflowSaveRequest, WorkflowNode, WorkflowEdge
from backend.app.services.workflow_service import WorkflowService


class WorkflowServiceVideoRoundTripTests(unittest.TestCase):
    def setUp(self):
        self._temp_dir = Path(tempfile.mkdtemp(prefix="wxhb-workflows-"))
        self.service = WorkflowService()
        self.service._storage_dir = self._temp_dir
        self.service._storage_dir.mkdir(parents=True, exist_ok=True)

    def tearDown(self):
        shutil.rmtree(self._temp_dir, ignore_errors=True)

    def test_save_and_load_preserves_video_nodes(self):
        request = WorkflowSaveRequest(
            name="Video Pipeline",
            nodes=[
                WorkflowNode(
                    id="upload-1",
                    type="imageUpload",
                    position={"x": 80, "y": 120},
                    data={
                        "label": "Key Frame",
                        "imageUrl": "/uploads/ref.png",
                    },
                ),
                WorkflowNode(
                    id="video-1",
                    type="videoGen",
                    position={"x": 420, "y": 120},
                    data={
                        "label": "Motion Clip",
                        "prompt": "gentle push in",
                        "aspectRatio": "16:9",
                        "durationSeconds": 4,
                        "motionStrength": 0.6,
                        "adapter": "mock",
                        "sourceImages": ["/uploads/ref.png"],
                        "outputVideo": "/outputs/mock-video.gif",
                        "resultCache": {"signature": "/outputs/mock-video.gif"},
                        "status": "success",
                        "progress": 100,
                    },
                ),
                WorkflowNode(
                    id="display-1",
                    type="videoDisplay",
                    position={"x": 760, "y": 120},
                    data={
                        "label": "Video Output",
                        "videos": ["/outputs/mock-video.gif"],
                        "status": "success",
                    },
                ),
            ],
            edges=[
                WorkflowEdge(id="edge-1", source="upload-1", target="video-1"),
                WorkflowEdge(id="edge-2", source="video-1", target="display-1"),
            ],
        )

        saved = self.service.save(request)
        loaded = self.service.get(saved.id)
        listed = self.service.list_all()

        self.assertIsNotNone(loaded)
        self.assertEqual(saved.name, "Video Pipeline")
        self.assertEqual(loaded.name, "Video Pipeline")
        self.assertEqual(len(loaded.nodes), 3)
        self.assertEqual(len(loaded.edges), 2)
        self.assertEqual(loaded.nodes[1].type, "videoGen")
        self.assertEqual(loaded.nodes[1].data["outputVideo"], "/outputs/mock-video.gif")
        self.assertEqual(loaded.nodes[2].type, "videoDisplay")
        self.assertEqual(loaded.nodes[2].data["videos"], ["/outputs/mock-video.gif"])
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0].node_count, 3)


if __name__ == "__main__":
    unittest.main()
