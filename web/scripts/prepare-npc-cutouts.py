"""User-authorized local background removal; never overwrite generated originals."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from rembg import new_session, remove

ROOT = Path(__file__).resolve().parents[1]
NPCS = ("kiseok", "seorin", "mira", "doyun")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="birefnet-general-lite")
    args = parser.parse_args()
    session = new_session(args.model, providers=["CPUExecutionProvider"])
    output_dir = ROOT / "public/assets/npcs"
    report = []
    for name in NPCS:
        source = output_dir / f"{name}-v1.png"
        destination = output_dir / f"{name}-cutout-v1.png"
        original = Image.open(source).convert("RGB")
        result = remove(original, session=session).convert("RGBA")
        alpha = np.array(result.getchannel("A"))
        alpha[alpha < 8] = 0
        result.putalpha(Image.fromarray(alpha))
        bbox = Image.fromarray((alpha > 16).astype("uint8") * 255).getbbox()
        if not bbox:
            raise ValueError(f"No foreground detected: {name}")
        cropped = result.crop(bbox)
        padding = 16
        output = Image.new("RGBA", (cropped.width + padding * 2, cropped.height + padding * 2))
        output.paste(cropped, (padding, padding))
        output.save(destination)
        a = np.array(output.getchannel("A"))
        foot_region = a[int(a.shape[0] * .86):] > 96
        ys, xs = np.where(foot_region)
        foot_x = float(np.mean(xs)) if len(xs) else output.width / 2
        transparent = float(np.mean(a == 0))
        if transparent < .15 or np.all(a == 0):
            raise ValueError(f"Invalid alpha coverage for {name}: {transparent}")
        report.append({
            "id": name, "source": source.name, "file": destination.name,
            "method": "local rembg", "model": args.model, "width": output.width, "height": output.height,
            "hasAlpha": True, "transparentFraction": round(transparent, 4),
            "contentBox": [padding, padding, padding + cropped.width, padding + cropped.height],
            "footX": round(foot_x, 2), "footY": padding + cropped.height,
            "sourceBox": list(bbox), "sha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
        })
        print(f"{name}: {output.width}x{output.height}, transparent={transparent:.1%}", flush=True)
    (output_dir / "cutouts.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
