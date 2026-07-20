import tempfile
import unittest
from pathlib import Path

from server.windup_pipeline.asset_catalog import AssetCatalog


class AssetCatalogTest(unittest.TestCase):
    def test_register_accepts_a_windows_style_generated_asset_path(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            base_file = root / "generation-data/characters/test-hero/base.png"
            base_file.parent.mkdir(parents=True)
            base_file.write_bytes(b"png")
            card_file = base_file.parent / "card.json"
            catalog = AssetCatalog(root, root / "generation-data/characters")

            record = catalog.register(
                {
                    "id": "test-hero",
                    "label": "Test Hero",
                    "base": r"generation-data\characters\test-hero\base.png",
                },
                card_file,
            )

            self.assertEqual(record["base"], "generation-data/characters/test-hero/base.png")

    def test_register_rejects_generated_asset_path_traversal(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            outside = root / "outside.png"
            outside.write_bytes(b"png")
            catalog = AssetCatalog(root, root / "generation-data/characters")

            with self.assertRaisesRegex(ValueError, "角色母版路径不合法"):
                catalog.register(
                    {
                        "id": "test-hero",
                        "base": "generation-data/characters/../../outside.png",
                    },
                    root / "card.json",
                )


if __name__ == "__main__":
    unittest.main()
