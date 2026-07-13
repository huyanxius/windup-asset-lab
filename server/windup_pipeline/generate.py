"""① 视角规整 + ④ 逐帧生成：调图像 API（OpenAI 兼容 /chat/completions）。

- 参考图 + 文字约束 → 生成图（route A：保"单帧可独立重画"）。
- key 从环境变量读（见 config.py）。
"""
import base64, re
from . import config, provider


def _call(text, ref_paths, out_path, timeout=200, model=None, api_key=None):
    """底层调用：text + 若干参考图 → 生成一张图存到 out_path。返回 bool。
    网络重试由 provider.post_json 统一处理；这里再对'调用成功但没返回有效图'多试几轮。"""
    content = text
    if ref_paths:
        content = [{"type": "text", "text": text}]
        for path in ref_paths:
            with open(path, "rb") as image:
                encoded = base64.b64encode(image.read()).decode()
            content.append({"type": "image_url",
                            "image_url": {"url": "data:image/png;base64," + encoded}})
    body = {
        "model": model or config.IMAGE_MODEL,
        "stream": False,
        "messages": [{"role": "user", "content": content}],
    }
    for attempt in range(3):                      # 空图重试（内含网络重试）
        res = provider.post_json("/chat/completions", body, timeout=timeout, api_key=api_key)
        m = re.search(r'data:image/[^;]+;base64,([A-Za-z0-9+/=]{100,})', __import__("json").dumps(res))
        if m:
            data = base64.b64decode(m.group(1))
            if len(data) > 5000:
                with open(out_path, "wb") as image:
                    image.write(data)
                return True
        print(f"    · 返回无有效图，重试 {attempt+1}/3")
    raise provider.ProviderError("模型调用成功，但响应中没有可用图像")


def to_side_view(ref_path, char_desc, out_path, model=None, api_key=None):
    """① 把任意视角角色转成伪侧面(3/4)基准帧。char_desc: 角色身份描述。"""
    txt = (f"Convert the character in the reference to a PSEUDO-SIDE (3/4) view facing RIGHT, "
           f"full body, standing. Keep the EXACT same identity and art style: {char_desc}. "
           f"{config.BG_MAGENTA}. {config.NO_SHADOW}. Character centered, full body head-to-feet.")
    return _call(txt, [ref_path], out_path, model=model, api_key=api_key)


def gen_character(char_desc, out_path, model=None, api_key=None):
    """从文字创建一张不依赖旧角色的游戏角色母版。"""
    txt = ("Create ONE original full-body chibi pixel-art game character master sprite. "
           f"Character definition: {char_desc}. Neutral standing pose, pseudo-side 3/4 view facing RIGHT. "
           "Clean readable silhouette, cohesive restrained color palette, polished literary fantasy art direction. "
           f"{config.BG_MAGENTA}. {config.NO_SHADOW}. Character centered, full body head-to-feet, no text, no frame.")
    return _call(txt, [], out_path, model=model, api_key=api_key)


def gen_frame(base_path, char_desc, pose_desc, out_path, skeleton_path=None, model=None, api_key=None):
    """④ 生成一帧动作。base_path=角色基准帧；pose_desc=该帧姿势；
    skeleton_path 可选：给一张骨架条件图做姿势约束。"""
    txt = (f"Using the reference as exact identity and scale, redraw {char_desc}. "
           f"Pose for THIS frame: {pose_desc}. "
           f"{config.BG_MAGENTA}. {config.NO_SHADOW}. "
           f"identical scale and vertical position, feet on same ground line.")
    refs = [base_path] + ([skeleton_path] if skeleton_path else [])
    if skeleton_path:
        txt = ("TWO reference images. Image 1 = character identity/scale. "
               "Image 2 = OpenPose skeleton for the exact pose. " + txt)
    return _call(txt, refs, out_path, model=model, api_key=api_key)


def gen_action_sheet(
    base_path,
    char_desc,
    action,
    phases,
    view,
    out_path,
    custom_prompt="",
    model=None,
    api_key=None,
):
    """Generate one coherent eight-panel action strip from one identity reference.

    This is the default full-action route. A rejected panel can still be repaired
    later through :func:`gen_frame` without regenerating the whole sequence.
    """
    phase_lines = "\n".join(f"Panel {index + 1}: {phase}" for index, phase in enumerate(phases))
    creator_constraints = f"\nCreator constraints: {custom_prompt}" if custom_prompt else ""
    text = (
        "Create ONE ultra-wide horizontal pixel-art sprite action strip from the reference character. "
        "The strip must contain EXACTLY 8 equal panels in one row, ordered left to right, with no borders, "
        "gaps, labels, captions, duplicate panels or extra characters. Preserve the EXACT same identity, "
        "face, hairstyle, costume, palette, pixel density and body proportions in every panel. "
        f"Character identity: {char_desc}. Action: {action}. Camera: true {view} game view. "
        "Keep the character at identical scale and the feet on one shared ground line. Each panel must show "
        "a clearly different animation phase and together form a continuous loop. "
        f"{config.BG_MAGENTA} across the full strip. {config.NO_SHADOW}.\n"
        f"Required left-to-right phases:\n{phase_lines}{creator_constraints}"
    )
    return _call(text, [base_path], out_path, timeout=240, model=model, api_key=api_key)
