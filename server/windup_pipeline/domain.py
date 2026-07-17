"""Built-in catalogue plus the generated shared product contract."""

from .generated_contract import (
    ACTION_LOOPS,
    ACTIONS,
    CONTRACT_VERSION,
    FPS,
    GENERATION,
    IMAGE_MODELS,
    POSES,
    VIEWS,
)

CATALOG = {
    "lamplighter": {
        "label": "旧试验角色 · 独立样例",
        "base": "assets/resources/character/frames/walk-01.png",
        "card": "assets/resources/character/card.json",
        "description": "young chibi pixel-art lamplighter, tousled black hair, navy coat, red scarf, charcoal trousers, brown boots, warm brass fasteners",
    },
    "boy": {
        "label": "少年 · 默认角色",
        "base": "assets/resources/characters/boy/base.png",
        "card": "assets/resources/characters/boy/card.json",
        "description": "young slender pixel-art boy with messy black hair, dark blue long coat, brown vest, white shirt, red scarf, brown trousers and boots",
    },
    "skeleton": {
        "label": "Skeleton",
        "base": "assets/resources/characters/skeleton/base.png",
        "card": "artifacts/characters/skeleton/card.json",
        "description": "cartoon pixel-art skeleton in dark segmented armour, flowing red scarf, broad weathered sword",
    },
    "lirael": {
        "label": "Lirael",
        "base": "assets/resources/characters/lirael/base.png",
        "card": "assets/resources/characters/lirael/card.json",
        "description": "pixel-art young druid in a deep green hooded dress, red hair, antler crown, rune details and a staff with a blue orb",
    },
    "samurai": {
        "label": "Samurai",
        "base": "assets/resources/characters/samurai/base.png",
        "card": "assets/resources/characters/samurai/card.json",
        "description": "pixel-art samurai warrior in layered armour with a sash and sheathed katana, ready stance",
    },
    "knight": {
        "label": "Knight",
        "base": "assets/resources/characters/knight/base.png",
        "card": "assets/resources/characters/knight/card.json",
        "description": "grayscale pixel-art knight in full plate armour with a large sword and tattered cape, combat stance",
    },
}
