"""Extract decorative art only; all queue text remains accessible, live HTML."""

from pathlib import Path

from PIL import Image


def main():
    images = Path(__file__).resolve().parents[1] / "web" / "public" / "images"
    with Image.open(images / "MyTurn Queue Dashboard.png") as source:
        # Excludes the heading and all service data from the supplied reference.
        source.crop((238, 393, 476, 523)).convert("RGB").save(
            images / "display-ticket-art.webp", lossless=True, method=6
        )


if __name__ == "__main__":
    main()
