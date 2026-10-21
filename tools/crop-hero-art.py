"""Crops the two device illustrations for the home page hero.

The people-sensor and ESP32 pictures each carry a caption baked into the
pixels, set at the size of a presentation slide. Scaled down to a card in a
hero section that text is unreadable, so the pictures are cut down to the
device itself - the white product shot in its mint ring - and the caption is
written in the page's own type instead. The original files are left untouched.

Run with the interpreter that has Pillow:  python tools/crop-hero-art.py
"""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
IMAGES = HERE.parent / "web" / "public" / "images"

# (source, output, box) - the box is (left, top, right, bottom) in source pixels.
CUTS = [
    # The white PIR sensor inside its mint ring: x 186..710, y 258..784.
    ("people-sensor.png", "people-sensor-device.png", (170, 240, 730, 800)),
    # The ESP32 board in its mint ring, with the wireless arcs above it:
    # circle x 185..725, y 257..797, arcs from y 191.
    ("esp32.png", "esp32-device.png", (150, 165, 750, 830)),
]


def main() -> None:
    for source, output, box in CUTS:
        path = IMAGES / source
        with Image.open(path) as im:
            crop = im.convert("RGB").crop(box)
            crop.save(IMAGES / output, "PNG", optimize=True)
        print(f"{source} -> {output} {crop.size}")


if __name__ == "__main__":
    main()
