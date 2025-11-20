@echo off
REM Virtual Closet - Extension Installer
REM Simply copies extension files to a ready-to-use folder

echo ========================================
echo Virtual Closet Extension Installer
echo ========================================
echo.

REM Create extension folder in user's Downloads
set "INSTALL_DIR=%USERPROFILE%\Downloads\VirtualCloset-Extension"

echo Installing to: %INSTALL_DIR%
echo.

REM Remove old installation if exists
if exist "%INSTALL_DIR%" (
    echo Removing old installation...
    rmdir /s /q "%INSTALL_DIR%"
)

REM Create directory structure
echo Creating extension folder...
mkdir "%INSTALL_DIR%"
mkdir "%INSTALL_DIR%\icons"

REM Copy extension files
echo Copying extension files...
xcopy /y "extension\manifest.json" "%INSTALL_DIR%\" >nul
xcopy /y "extension\background.js" "%INSTALL_DIR%\" >nul
xcopy /y "extension\popup.html" "%INSTALL_DIR%\" >nul
xcopy /y "extension\popup.js" "%INSTALL_DIR%\" >nul
xcopy /y "extension\content.js" "%INSTALL_DIR%\" >nul
xcopy /y "extension\README.md" "%INSTALL_DIR%\" >nul
xcopy /y "extension\INSTALLATION.md" "%INSTALL_DIR%\" >nul

REM Create simple placeholder icons using PowerShell
echo Creating placeholder icons...
powershell -Command "$sizes = @(16,32,48,128); foreach ($size in $sizes) { Add-Type -AssemblyName System.Drawing; $bmp = New-Object System.Drawing.Bitmap($size, $size); $graphics = [System.Drawing.Graphics]::FromImage($bmp); $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush([System.Drawing.Point]::new(0,0), [System.Drawing.Point]::new($size,$size), [System.Drawing.Color]::FromArgb(102,126,234), [System.Drawing.Color]::FromArgb(118,75,162)); $graphics.FillRectangle($brush, 0, 0, $size, $size); $font = New-Object System.Drawing.Font('Arial', $size/3, [System.Drawing.FontStyle]::Bold); $textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White); $graphics.DrawString('VC', $font, $textBrush, $size/6, $size/6); $bmp.Save('%INSTALL_DIR%\icons\icon' + $size + '.png', [System.Drawing.Imaging.ImageFormat]::Png); $graphics.Dispose(); $bmp.Dispose(); }"

echo.
echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo Extension installed to:
echo %INSTALL_DIR%
echo.
echo Next steps:
echo 1. Open Chrome and go to chrome://extensions/
echo 2. Enable "Developer mode" (top right)
echo 3. Click "Load unpacked"
echo 4. Navigate to: %INSTALL_DIR%
echo 5. Click "Select Folder"
echo.
echo Press any key to open the extension folder...
pause >nul
explorer "%INSTALL_DIR%"

