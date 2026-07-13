import unittest

from server.windup_pipeline.session_store import ProviderSessionStore


class ProviderSessionStoreTest(unittest.TestCase):
    def test_provider_credentials_are_isolated_by_browser_session(self):
        store = ProviderSessionStore(default_model="model-a")
        store.connect("browser-a", "key-a", "model-a")
        store.connect("browser-b", "key-b", "model-b")
        self.assertEqual(store.get_or_create("browser-a").api_key, "key-a")
        self.assertEqual(store.get_or_create("browser-b").api_key, "key-b")
        store.fail("browser-a", "expired")
        self.assertTrue(store.get_or_create("browser-b").verified)


if __name__ == "__main__":
    unittest.main()
