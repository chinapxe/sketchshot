import os
import shutil
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

os.environ["DEBUG"] = "false"

from backend.app.services.three_view_split_service import ThreeViewSplitService


class ThreeViewSplitServiceTests(unittest.TestCase):
    def setUp(self):
        self._temp_dir = Path(tempfile.mkdtemp(prefix="wxhb-three-view-split-"))
        self.upload_dir = self._temp_dir / "uploads"
        self.output_dir = self._temp_dir / "outputs"
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.service = ThreeViewSplitService(upload_dir=self.upload_dir, output_dir=self.output_dir)

    def tearDown(self):
        shutil.rmtree(self._temp_dir, ignore_errors=True)

    def test_split_sheet_extracts_three_panels_in_order(self):
        sheet_path = self.output_dir / "sheet.png"
        canvas = Image.new("RGB", (900, 600), color=(250, 250, 250))
        draw = ImageDraw.Draw(canvas)
        draw.rectangle((60, 80, 240, 560), fill=(220, 60, 60))
        draw.rectangle((360, 80, 540, 560), fill=(60, 180, 80))
        draw.rectangle((660, 80, 840, 560), fill=(70, 90, 220))
        canvas.save(sheet_path, format="PNG")

        result = self.service.split_sheet("/outputs/sheet.png")

        self.assertSetEqual(set(result.keys()), {"front", "side", "back"})

        front_path = self.output_dir / Path(result["front"].removeprefix("/outputs/")).name
        side_path = self.output_dir / Path(result["side"].removeprefix("/outputs/")).name
        back_path = self.output_dir / Path(result["back"].removeprefix("/outputs/")).name

        self.assertTrue(front_path.exists())
        self.assertTrue(side_path.exists())
        self.assertTrue(back_path.exists())

        with Image.open(front_path) as front_image:
            self.assertGreater(front_image.size[0], 150)
            self.assertGreater(front_image.size[1], 450)
            self.assertGreater(front_image.getpixel((front_image.size[0] // 2, front_image.size[1] // 2))[0], 180)

        with Image.open(side_path) as side_image:
            self.assertGreater(side_image.getpixel((side_image.size[0] // 2, side_image.size[1] // 2))[1], 140)

        with Image.open(back_path) as back_image:
            self.assertGreater(back_image.getpixel((back_image.size[0] // 2, back_image.size[1] // 2))[2], 180)

    def test_split_sheet_rejects_non_sheet_image(self):
        single_path = self.output_dir / "single.png"
        canvas = Image.new("RGB", (320, 600), color=(250, 250, 250))
        draw = ImageDraw.Draw(canvas)
        draw.rectangle((70, 80, 250, 560), fill=(40, 80, 160))
        canvas.save(single_path, format="PNG")

        with self.assertRaises(ValueError):
            self.service.split_sheet("/outputs/single.png")


if __name__ == "__main__":
    unittest.main()
