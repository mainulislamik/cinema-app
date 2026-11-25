import os
from PIL import Image, ImageDraw

RES_DIR = "/home/imon/cinema-mobile/android/app/src/main/res"
SRC_ICON = "/home/imon/cinama-logos/final_concept_red/icon_1024.png"
SRC_FG = "/home/imon/cinama-logos/final_concept_red/fg_432.png"
SRC_SPLASH = "/home/imon/cinama-logos/final_concept_red/splash_512.png"

# Densities and sizes
# ic_launcher / round: 48, 72, 96, 144, 192
# ic_launcher_foreground: 108, 162, 216, 324, 432
DENSITIES = {
    "mipmap-mdpi": (48, 108),
    "mipmap-hdpi": (72, 162),
    "mipmap-xhdpi": (96, 216),
    "mipmap-xxhdpi": (144, 324),
    "mipmap-xxxhdpi": (192, 432)
}

# Open source images
icon_1024 = Image.open(SRC_ICON).convert("RGBA")
fg_432 = Image.open(SRC_FG).convert("RGBA")
splash_512 = Image.open(SRC_SPLASH).convert("RGBA")

for folder, (size_icon, size_fg) in DENSITIES.items():
    target_dir = os.path.join(RES_DIR, folder)
    os.makedirs(target_dir, exist_ok=True)
    
    # 1. ic_launcher.webp
    launcher = icon_1024.resize((size_icon, size_icon), Image.Resampling.LANCZOS)
    launcher_path = os.path.join(target_dir, "ic_launcher.webp")
    launcher.save(launcher_path, "WEBP", quality=95)
    # Also save png if needed
    launcher.save(os.path.join(target_dir, "ic_launcher.png"), "PNG")
    
    # 2. ic_launcher_round.webp (circular mask)
    mask = Image.new("L", (size_icon, size_icon), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size_icon, size_icon), fill=255)
    
    round_launcher = Image.new("RGBA", (size_icon, size_icon), (0, 0, 0, 0))
    round_launcher.paste(launcher, (0, 0), mask=mask)
    round_launcher.save(os.path.join(target_dir, "ic_launcher_round.webp"), "WEBP", quality=95)
    round_launcher.save(os.path.join(target_dir, "ic_launcher_round.png"), "PNG")
    
    # 3. ic_launcher_foreground.webp
    fg = fg_432.resize((size_fg, size_fg), Image.Resampling.LANCZOS)
    fg.save(os.path.join(target_dir, "ic_launcher_foreground.webp"), "WEBP", quality=95)
    fg.save(os.path.join(target_dir, "ic_launcher_foreground.png"), "PNG")
    print(f"Updated {folder}: icon {size_icon}x{size_icon}, fg {size_fg}x{size_fg}")

# Update splashscreen_logo.png in drawables
SPLASH_SIZES = {
    "drawable-mdpi": 288,
    "drawable-hdpi": 432,
    "drawable-xhdpi": 576,
    "drawable-xxhdpi": 864,
    "drawable-xxxhdpi": 1152
}

for folder, size in SPLASH_SIZES.items():
    target_dir = os.path.join(RES_DIR, folder)
    os.makedirs(target_dir, exist_ok=True)
    sp = splash_512.resize((size, size), Image.Resampling.LANCZOS)
    sp.save(os.path.join(target_dir, "splashscreen_logo.png"), "PNG")
    print(f"Updated {folder}: splash {size}x{size}")

# Update colors.xml iconBackground to #09090b
colors_xml_path = os.path.join(RES_DIR, "values/colors.xml")
with open(colors_xml_path, "w") as f:
    f.write("""<resources>
  <color name="splashscreen_background">#09090b</color>
  <color name="iconBackground">#09090b</color>
  <color name="colorPrimary">#E11D48</color>
</resources>
""")

print("Successfully injected all new Red icons and drawables into Android native project!")
