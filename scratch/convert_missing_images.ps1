Add-Type -AssemblyName System.Drawing
$menuDir = "c:\Users\shyam\Downloads\Russell Hall cafe\user\images\menu"

$files = @("mocha.png", "cheese-tomato.png")

foreach ($file in $files) {
    $src = Join-Path $menuDir $file
    $dest = Join-Path $menuDir ($file.Replace(".png", ".jpg"))
    if (Test-Path $src) {
        Write-Host "Converting $src to $dest..."
        $img = [System.Drawing.Image]::FromFile($src)
        $img.Save($dest, [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $img.Dispose()
        Write-Host "[SUCCESS] Successfully converted!"
    } else {
        Write-Host "[WARN] Source file $src not found!"
    }
}
