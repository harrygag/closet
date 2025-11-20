# Extension Icons Required

You need to create 4 icon sizes for the Chrome extension:

- **icon16.png** - 16x16 pixels
- **icon32.png** - 32x32 pixels  
- **icon48.png** - 48x48 pixels
- **icon128.png** - 128x128 pixels

## Quick Way to Generate Icons

### Option 1: Use an online tool
1. Go to https://favicon.io/favicon-generator/
2. Create an icon with your Virtual Closet logo (👗 or 🏷️)
3. Download and resize to the 4 required sizes

### Option 2: Use ImageMagick (if installed)
```bash
# Create a simple purple icon with white text
convert -size 128x128 xc:"#764ba2" -gravity center -pointsize 64 -fill white -annotate +0+0 "VC" icon128.png
convert icon128.png -resize 48x48 icon48.png
convert icon128.png -resize 32x32 icon32.png
convert icon128.png -resize 16x16 icon16.png
```

### Option 3: Use your logo
If you have a Virtual Closet logo, just resize it to these 4 sizes and place them in this folder.

## Temporary Workaround
For testing, you can use any PNG files with these names. The extension will work without proper icons.

