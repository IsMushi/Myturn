"""Extract only the illustration from the supplied homepage concept (requires Pillow).

The live page renders its own accessible heading, navigation and links. Keeping
the illustrated sensor badges and connectors together preserves their alignment
with the desk at every image size; no navigation or CTA text is in this crop.
"""

from pathlib import Path

from PIL import Image


def main():
    images = Path(__file__).resolve().parents[1] / "web" / "public" / "images"
    with Image.open(images / "hero-section-ui.png") as source:
        source.crop((740, 98, 1672, 941)).convert("RGB").save(
            images / "hero-desk-scene.webp", quality=95, method=6
        )


if __name__ == "__main__":
    main()
