# Design QA

- Source visual truth: `C:\Users\24048\Desktop\螢幕截圖 2026-07-17 16.08.25.png`
- Implementation: `http://127.0.0.1:5174/asset-lab/#/studio`
- Reference viewport: 2560 × 1618
- Intended state: Studio → AI 快捷创作 → 指令输入
- Implementation screenshot: not captured

## Full-view comparison evidence

The source screenshot was opened and inspected. It establishes a compact global navigation, a top-centered mode switch, a left-aligned return/title control, a centered suggestion capsule, a bottom command composer, small canvas tools, and a lower-right output preview. Per the latest user annotations, the composition is retained while its near-black palette is intentionally replaced with Windup's original light gray, off-white, and dark green tokens, and the unbound canvas-tool controls are omitted.

The corresponding browser-rendered implementation screenshot cannot be captured in this repository workflow because `AGENTS.md` explicitly prohibits browser screenshot automation and requires visual acceptance to remain manual. A same-viewport image comparison therefore cannot be completed.

## Focused-region comparison evidence

Blocked for the same reason. The header controls, suggestion capsule, command composer, progress runner, result delivery panel, font sizing, and responsive layout require manual browser inspection.

## Findings

- [P2] Automated visual comparison unavailable
  - Location: all newly redesigned Studio surfaces.
  - Evidence: source visual is available, but no permitted implementation capture exists.
  - Impact: typography, spacing, wrapping, and viewport fit cannot be certified from rendered evidence.
  - Fix: manually inspect the input, progress, result, mode chooser, and existing workflow states at desktop and narrow widths.

## Comparison history

- Initial pass: blocked before visual comparison because automated screenshot capture is prohibited by repository rules.

## Manual acceptance checklist

- Confirm every new screen exposes a visible return control with a 44–52px target.
- Confirm the reference composition remains recognizable at 2560 × 1618 and 1366 × 768.
- Confirm the bottom composer and progress runner never cover the right preview.
- Confirm Chinese text uses the intended weight and does not clip or wrap unexpectedly.
- Confirm mode switching, return, example prompts, skip, export, preview, save, and create-again interactions.
- Confirm the existing workflow still exposes all three material sources.

final result: blocked
