# Script para iniciar Kristoff sin Node/NPM global
$ElectronPath = ".\node_modules\electron\dist\electron.exe"

if (Test-Path $ElectronPath) {
    Write-Host "Iniciando Kristoff..." -ForegroundColor Cyan
    & $ElectronPath .
} else {
    Write-Error "No se encontró el ejecutable de Electron en node_modules. Asegúrate de estar en la raíz del proyecto."
}
