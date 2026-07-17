import io
import tempfile
import unittest
from pathlib import Path

from PIL import Image

from server.windup_pipeline.reference_store import ReferenceStore


def png_bytes(size=(96, 128)):
    stream = io.BytesIO()
    Image.new("RGBA", size, (24, 48, 72, 255)).save(stream, "PNG")
    return stream.getvalue()


class ReferenceStoreTest(unittest.TestCase):
    def test_valid_png_is_saved_with_a_public_relative_url(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = ReferenceStore(Path(temporary))
            store.prepare()
            record = store.save("windup-demo", png_bytes(), "image/png", "../hero.png")

            self.assertRegex(record["id"], r"^ref-[a-f0-9]{12}$")
            self.assertEqual(record["filename"], "hero.png")
            self.assertEqual((record["width"], record["height"]), (96, 128))
            self.assertTrue(store.resolve("windup-demo", record["id"]).is_file())
            self.assertNotIn(str(Path(temporary)), record["assetUrl"])

    def test_invalid_content_and_mismatched_media_type_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            store = ReferenceStore(Path(temporary))
            store.prepare()
            with self.assertRaisesRegex(ValueError, "有效"):
                store.save("windup-demo", b"not-an-image", "image/png")
            with self.assertRaisesRegex(ValueError, "类型"):
                store.save("windup-demo", png_bytes(), "image/jpeg")


if __name__ == "__main__":
    unittest.main()
