import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

from server.windup_pipeline import processing
from server.windup_pipeline.quality import EvaluationResult, QualityGate


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def issue_codes(report):
    return {issue["code"] for issue in report["blockingIssues"]}


def make_frame(path: Path, *, left: int = 96, color=(32, 56, 92, 255), marker: int = 0) -> Path:
    image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rectangle((left, 76, left + 54, 237), fill=color)
    draw.rectangle((left + 8 + marker, 100, left + 12 + marker, 108), fill=(196, 154, 82, 255))
    image.save(path)
    return path


class SequenceQualityGateTest(unittest.TestCase):
    def test_archived_walk_sample_is_blocked_for_horizontal_guide_lines(self):
        frames = [
            PROJECT_ROOT / "docs-assets" / "walk-skeleton-v1" / f"walk-{index:02d}.png"
            for index in range(1, 9)
        ]

        report = processing.sequence_quality(frames, "walk")

        self.assertFalse(report["passed"])
        self.assertIn("horizontal_guide_line", issue_codes(report))
        self.assertEqual(report["frameCount"], 8)
        self.assertTrue(report["metrics"]["horizontalGuideLines"])

    def test_duplicate_and_near_duplicate_frames_are_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            frames = [
                make_frame(root / "frame-0.png", left=96),
                make_frame(root / "frame-1.png", left=96),
                make_frame(root / "frame-2.png", left=97),
            ]
            frames.extend(
                make_frame(root / f"frame-{index}.png", left=96 + index * 4, marker=index % 5)
                for index in range(3, 8)
            )

            report = processing.sequence_quality(frames)

            self.assertIn("duplicate_frames", issue_codes(report))
            self.assertIn([0, 1], report["metrics"]["duplicatePairs"])
            self.assertTrue(report["metrics"]["nearDuplicatePairs"])
            self.assertTrue(any("近重复" in warning for warning in report["warnings"]))

    def test_palette_drift_is_blocking(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            frames = [
                make_frame(root / f"frame-{index}.png", left=92 + index, marker=index % 5)
                for index in range(7)
            ]
            frames.append(make_frame(root / "frame-7.png", left=99, color=(30, 190, 70, 255)))

            report = processing.sequence_quality(frames)

            self.assertIn("palette_drift", issue_codes(report))
            self.assertIn(7, report["metrics"]["paletteOutlierFrames"])

    def test_loop_seam_anomaly_is_blocking(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            positions = [96, 99, 102, 105, 108, 111, 114, 130]
            frames = [
                make_frame(root / f"frame-{index}.png", left=left, marker=index % 5)
                for index, left in enumerate(positions)
            ]

            report = processing.sequence_quality(frames, "walk")

            self.assertIn("loop_seam", issue_codes(report))
            self.assertGreater(
                report["metrics"]["loopSeamDifference"],
                report["metrics"]["medianAdjacentDifference"],
            )

    def test_invisible_frame_is_a_blocking_geometry_issue(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            frames = [make_frame(root / f"frame-{index}.png", left=94 + index) for index in range(7)]
            invisible = root / "frame-7.png"
            Image.new("RGBA", (256, 256), (0, 0, 0, 0)).save(invisible)
            frames.append(invisible)

            report = processing.sequence_quality(frames)

            self.assertFalse(report["passed"])
            self.assertIn("invisible_frames", issue_codes(report))
            self.assertIsNone(report["frames"][7])

    def test_clean_loop_passes_and_preserves_legacy_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            positions = [96, 100, 104, 102, 98, 94, 90, 92]
            frames = [
                make_frame(root / f"frame-{index}.png", left=left, marker=index % 5)
                for index, left in enumerate(positions)
            ]

            report = processing.sequence_quality(frames, "walk")

            self.assertTrue(report["passed"])
            for key in (
                "passed",
                "frameCount",
                "geometryContinuity",
                "frames",
                "warnings",
                "semanticReviewRequired",
                "blockingIssues",
                "metrics",
            ):
                self.assertIn(key, report)

    def test_quality_gate_accepts_composable_evaluators(self):
        class CustomEvaluator:
            def evaluate(self, context):
                return EvaluationResult(
                    blocking_issues=[{"code": "custom", "message": "custom rejection"}],
                    metrics={"customMetric": 1},
                )

        with tempfile.TemporaryDirectory() as directory:
            frame = make_frame(Path(directory) / "frame.png")

            report = QualityGate([CustomEvaluator()]).evaluate([frame])

            self.assertFalse(report["passed"])
            self.assertIn("custom", issue_codes(report))
            self.assertEqual(report["metrics"]["customMetric"], 1)


if __name__ == "__main__":
    unittest.main()
