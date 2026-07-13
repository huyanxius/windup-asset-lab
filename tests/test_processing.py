import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from server.windup_pipeline import processing


class ActionSheetProcessingTest(unittest.TestCase):
    def test_horizontal_sheet_is_split_normalized_and_quality_checked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sheet = Image.new("RGBA", (800, 240), (0, 0, 0, 0))
            draw = ImageDraw.Draw(sheet)
            for index in range(8):
                left = index * 100 + 30
                draw.rectangle((left, 40 + index % 2, left + 38, 220), fill=(30, 30, 35, 255))
            source = root / "sheet.png"
            sheet.save(source)

            outputs = processing.split_action_sheet(source, root / "frames", "walk", 8)
            quality = processing.sequence_quality(outputs)

            self.assertEqual(len(outputs), 8)
            self.assertEqual([path.name for path in outputs], [f"walk-{index:02d}.png" for index in range(1, 9)])
            for path in outputs:
                with Image.open(path) as frame:
                    self.assertEqual(frame.size, (256, 256))
            self.assertTrue(quality["passed"])
            self.assertEqual(quality["frameCount"], 8)

    def test_sheet_rejects_dimensions_that_cannot_hold_eight_panels(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "square.png"
            Image.new("RGBA", (256, 256), (0, 0, 0, 0)).save(source)
            with self.assertRaisesRegex(RuntimeError, "横向动作条"):
                processing.split_action_sheet(source, root / "frames", "walk", 8)


if __name__ == "__main__":
    unittest.main()
