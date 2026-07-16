"""③ 生成连续走路循环的 OpenPose 骨架序列（side-view，正弦相位驱动）。

- 相邻帧姿势渐变 → 帧间连贯（平滑的基础）。
- 近腿(亮青)/远腿(暗蓝)区分 → 解决侧视图左右腿混淆。
- 仅对"露腿"角色（如无长裙）有意义；长裙角色建议改用 generate.gen_frame 的动作描述。
"""
import math
from PIL import Image, ImageDraw

W = H = 512
NECK = (256, 150); HIP = (256, 300); HEAD = (256, 95)
GROUND_Y = 494  # 定位点：固定地平线（双腿垂直时脚踝所在 y），8 帧共用


def _dot(d, p, r=5):
    d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(255, 255, 255))


def _leg(d, hip, phase, thigh_c, shin_c):
    hipang = 32 * math.sin(phase)
    bend = max(0, -math.sin(phase)) * 45 + max(0, math.sin(phase - 1.2)) * 15
    UP, LO = 98, 96
    kx = hip[0] + UP * math.sin(math.radians(hipang))
    ky = hip[1] + UP * math.cos(math.radians(hipang))
    sh = hipang - bend
    ax = kx + LO * math.sin(math.radians(sh))
    ay = ky + LO * math.cos(math.radians(sh))
    d.line([hip, (kx, ky)], fill=thigh_c, width=10)
    d.line([(kx, ky), (ax, ay)], fill=shin_c, width=10)
    d.line([(ax, ay), (ax + 22, ay)], fill=shin_c, width=9)
    _dot(d, (kx, ky)); _dot(d, (ax, ay))   # 定位点：膝、踝
    return (kx, ky), (ax, ay)


def _arm(d, sho, phase, uc, lc):
    a = 26 * math.sin(phase)
    ex = sho[0] + 68 * math.sin(math.radians(a)); ey = sho[1] + 68 * math.cos(math.radians(a))
    hx = ex + 60 * math.sin(math.radians(a * 1.4)); hy = ey + 60 * math.cos(math.radians(a * 1.4))
    d.line([sho, (ex, ey)], fill=uc, width=9); d.line([(ex, ey), (hx, hy)], fill=lc, width=9)
    _dot(d, (ex, ey)); _dot(d, (hx, hy))   # 定位点：肘、手


def make_walk_skeletons(out_dir, n=8):
    """生成 n 帧走路骨架，存 out_dir/pose_{i}.png，返回路径列表。"""
    import os
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for i in range(n):
        # 相位偏移 +π/2：使第 1 帧 = 接触位（近腿前伸最大），与合同姿势行
        # CONTACT/DOWN/PASSING/UP/对侧×4 一一对应，骨骼图与姿势文本不再互相矛盾。
        t = i / n * 2 * math.pi + math.pi / 2
        bob = int(6 * math.sin(2 * t))
        hip = (256, 300 + bob); neck = (256, 150 + bob); head = (256, 95 + bob); sho = (256, neck[1] + 12)
        im = Image.new("RGB", (W, H), (0, 0, 0)); d = ImageDraw.Draw(im)
        d.line([(40, GROUND_Y), (W - 40, GROUND_Y)], fill=(120, 120, 120), width=3)  # 定位点：地平线
        _leg(d, hip, t + math.pi, (0, 90, 180), (0, 60, 140))     # 远腿 暗蓝
        _arm(d, sho, t, (150, 90, 0), (150, 120, 0))              # 远臂 暗橙
        d.line([neck, hip], fill=(0, 200, 0), width=11)
        d.line([neck, head], fill=(200, 0, 0), width=11)
        _arm(d, sho, t + math.pi, (255, 170, 0), (255, 230, 0))   # 近臂 亮橙
        _leg(d, hip, t, (0, 230, 120), (0, 230, 230))             # 近腿 亮青
        for p in [head, neck, hip, sho]:
            d.ellipse([p[0]-6, p[1]-6, p[0]+6, p[1]+6], fill=(255, 255, 255))
        p = f"{out_dir}/pose_{i}.png"; im.save(p); paths.append(p)
    return paths
