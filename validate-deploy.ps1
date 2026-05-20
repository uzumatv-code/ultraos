# Script de validação antes do deploy no Easypanel
# PowerShell version

Write-Host "🔍 Validando projeto para Easypanel..." -ForegroundColor Cyan
Write-Host ""

$errors = 0

# Verificar arquivos essenciais
Write-Host "📦 Verificando arquivos essenciais..." -ForegroundColor Cyan
$files = @("Dockerfile", "easypanel.yml", "nginx.conf", "package.json", "vite.config.ts", "index.html")
foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "  ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $file FALTANDO!" -ForegroundColor Red
        $errors++
    }
}

# Verificar pastas essenciais
Write-Host ""
Write-Host "📁 Verificando pastas essenciais..." -ForegroundColor Cyan
$dirs = @("src", "public")
foreach ($dir in $dirs) {
    if (Test-Path $dir) {
        Write-Host "  ✅ $dir/" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $dir/ FALTANDO!" -ForegroundColor Red
        $errors++
    }
}

# Verificar arquivos public
Write-Host ""
Write-Host "🎨 Verificando assets públicos..." -ForegroundColor Cyan
$publicFiles = @("public/manifest.json", "public/icon-192.svg")
foreach ($file in $publicFiles) {
    if (Test-Path $file) {
        Write-Host "  ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  $file não encontrado" -ForegroundColor Yellow
    }
}

# Verificar sw.js
if (Test-Path "public/sw.js") {
    Write-Host "  ✅ public/sw.js (Service Worker)" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  public/sw.js não encontrado" -ForegroundColor Yellow
}

# Verificar se arquivos desnecessários foram removidos
Write-Host ""
Write-Host "🗑️  Verificando limpeza..." -ForegroundColor Cyan
$unwanted = @("docker-compose.yml", "Dockerfile.prod", "easypanel-simple.yml", "Brasília", "supabase", ".vscode", ".easypanel")
foreach ($item in $unwanted) {
    if (Test-Path $item) {
        Write-Host "  ⚠️  $item ainda existe (pode remover)" -ForegroundColor Yellow
    } else {
        Write-Host "  ✅ $item (removido)" -ForegroundColor Green
    }
}

# Verificar variáveis de ambiente
Write-Host ""
Write-Host "🔐 Verificando configuração..." -ForegroundColor Cyan
if (Test-Path ".env.example") {
    Write-Host "  ✅ .env.example presente" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  .env.example não encontrado" -ForegroundColor Yellow
}

if ((Get-Content easypanel.yml -Raw) -match "VITE_SUPABASE_URL") {
    Write-Host "  ✅ Variáveis Supabase configuradas no easypanel.yml" -ForegroundColor Green
} else {
    Write-Host "  ❌ Variáveis Supabase não encontradas no easypanel.yml" -ForegroundColor Red
    $errors++
}

# Verificar se Dockerfile copia public/
if ((Get-Content Dockerfile -Raw) -match "COPY public/") {
    Write-Host "  ✅ Dockerfile copia pasta public/" -ForegroundColor Green
} else {
    Write-Host "  ❌ Dockerfile não copia pasta public/" -ForegroundColor Red
    $errors++
}

# Resultado final
Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
if ($errors -eq 0) {
    Write-Host "✅ PROJETO PRONTO PARA DEPLOY!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Próximos passos:" -ForegroundColor Yellow
    Write-Host "1. git add ."
    Write-Host "2. git commit -m `"Deploy ready for Easypanel`""
    Write-Host "3. git push origin main"
    Write-Host "4. Deploy via Easypanel"
    Write-Host ""
    Write-Host "📚 Consulte EASYPANEL_CHECKLIST.md para mais detalhes" -ForegroundColor Cyan
} else {
    Write-Host "❌ $errors erro(s) encontrado(s)" -ForegroundColor Red
    Write-Host "Corrija os problemas antes do deploy" -ForegroundColor Yellow
    exit 1
}
