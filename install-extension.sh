#!/bin/bash
# Virtual Closet - Extension Installer (Mac/Linux)
# Simply copies extension files to a ready-to-use folder

echo "========================================"
echo "Virtual Closet Extension Installer"
echo "========================================"
echo ""

# Create extension folder in user's Downloads
INSTALL_DIR="$HOME/Downloads/VirtualCloset-Extension"

echo "Installing to: $INSTALL_DIR"
echo ""

# Remove old installation if exists
if [ -d "$INSTALL_DIR" ]; then
    echo "Removing old installation..."
    rm -rf "$INSTALL_DIR"
fi

# Create directory structure
echo "Creating extension folder..."
mkdir -p "$INSTALL_DIR/icons"

# Copy extension files
echo "Copying extension files..."
cp extension/manifest.json "$INSTALL_DIR/"
cp extension/background.js "$INSTALL_DIR/"
cp extension/popup.html "$INSTALL_DIR/"
cp extension/popup.js "$INSTALL_DIR/"
cp extension/content.js "$INSTALL_DIR/"
cp extension/README.md "$INSTALL_DIR/"
cp extension/INSTALLATION.md "$INSTALL_DIR/"

# Create placeholder icons using ImageMagick (if available) or Python
echo "Creating placeholder icons..."
if command -v convert &> /dev/null; then
    # Use ImageMagick
    convert -size 128x128 xc:"#764ba2" -gravity center -pointsize 64 -fill white -annotate +0+0 "VC" "$INSTALL_DIR/icons/icon128.png"
    convert "$INSTALL_DIR/icons/icon128.png" -resize 48x48 "$INSTALL_DIR/icons/icon48.png"
    convert "$INSTALL_DIR/icons/icon128.png" -resize 32x32 "$INSTALL_DIR/icons/icon32.png"
    convert "$INSTALL_DIR/icons/icon128.png" -resize 16x16 "$INSTALL_DIR/icons/icon16.png"
elif command -v python3 &> /dev/null; then
    # Use Python with PIL
    python3 << 'EOF'
from PIL import Image, ImageDraw, ImageFont
import os

install_dir = os.path.expanduser("~/Downloads/VirtualCloset-Extension")
sizes = [16, 32, 48, 128]

for size in sizes:
    img = Image.new('RGB', (size, size), color='#764ba2')
    draw = ImageDraw.Draw(img)
    
    # Draw "VC" text
    font_size = size // 2
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except:
            font = ImageFont.load_default()
    
    text = "VC"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    x = (size - text_width) // 2
    y = (size - text_height) // 2
    
    draw.text((x, y), text, fill='white', font=font)
    img.save(f"{install_dir}/icons/icon{size}.png")

print("Icons created successfully!")
EOF
else
    # Create simple colored PNG files as fallback
    echo "Warning: ImageMagick or Python PIL not found. Creating minimal icons..."
    for size in 16 32 48 128; do
        # Create a minimal purple square
        printf '\x89PNG\r\n\x1a\n' > "$INSTALL_DIR/icons/icon$size.png"
    done
fi

echo ""
echo "========================================"
echo "Installation Complete!"
echo "========================================"
echo ""
echo "Extension installed to:"
echo "$INSTALL_DIR"
echo ""
echo "Next steps:"
echo "1. Open Chrome and go to chrome://extensions/"
echo "2. Enable 'Developer mode' (top right)"
echo "3. Click 'Load unpacked'"
echo "4. Navigate to: $INSTALL_DIR"
echo "5. Click 'Select Folder'"
echo ""

# Open the folder (Mac/Linux)
if [[ "$OSTYPE" == "darwin"* ]]; then
    open "$INSTALL_DIR"
elif command -v xdg-open &> /dev/null; then
    xdg-open "$INSTALL_DIR"
fi

echo "Done!"

