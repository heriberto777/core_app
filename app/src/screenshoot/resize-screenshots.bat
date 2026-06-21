@echo off
echo Redimensionando screenshots para uso con IA...

rem Necesitas ImageMagick instalado: https://imagemagick.org/script/download.php#windows

for %%f in (*.png) do (
  magick "%%f" -resize 768x768^ -quality 75 "%%~dpnf_small.png"
  echo Procesado: %%f
)

echo Listo. Archivos _small.png creados.
pause