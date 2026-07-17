import unittest

from tools.check_python_orphans import (
    APP_PATH,
    imported_pipeline_modules,
    pipeline_modules,
    reachable_modules,
)


class PythonOrphanCheckTest(unittest.TestCase):
    def test_reachability_excludes_disconnected_modules(self):
        graph = {
            "application": {"provider"},
            "provider": set(),
            "legacy": {"provider"},
        }

        self.assertEqual(reachable_modules({"application"}, graph), {"application", "provider"})

    def test_repository_backend_is_reachable_from_application_entrypoint(self):
        modules = pipeline_modules()
        known = set(modules)
        graph = {
            module: imported_pipeline_modules(path, known)
            for module, path in modules.items()
        }
        roots = imported_pipeline_modules(APP_PATH, known)

        self.assertEqual(known - reachable_modules(roots, graph), set())


if __name__ == "__main__":
    unittest.main()
