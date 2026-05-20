#!/bin/bash
# Script de validação antes do deploy no Easypanel

echo "🔍 Validando projeto para Easypanel..."
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

errors=0

# Verificar arquivos essenciais
echo "📦 Verificando arquivos essenciais..."
files=("Dockerfile" "easypanel.yml" "nginx.conf" "package.json" "vite.config.ts" "index.html")
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $file${NC}"
    else
        echo -e "${RED}❌ $file FALTANDO!${NC}"
        ((errors++))
    fi
done

# Verificar pastas essenciais
echo ""
echo "📁 Verificando pastas essenciais..."
dirs=("src" "public")
for dir in "${dirs[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✅ $dir/${NC}"
    else
        echo -e "${RED}❌ $dir/ FALTANDO!${NC}"
        ((errors++))
    fi
done

# Verificar arquivos public
echo ""
echo "🎨 Verificando assets públicos..."
public_files=("public/manifest.json" "public/icon-192.svg")
for file in "${public_files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $file${NC}"
    else
        echo -e "${YELLOW}⚠️  $file não encontrado${NC}"
    fi
done

# Verificar se arquivos desnecessários foram removidos
echo ""
echo "🗑️  Verificando limpeza..."
unwanted=("docker-compose.yml" "Dockerfile.prod" "easypanel-simple.yml" "Brasília" "supabase" ".vscode")
for item in "${unwanted[@]}"; do
    if [ -e "$item" ]; then
        echo -e "${YELLOW}⚠️  $item ainda existe (pode remover)${NC}"
    else
        echo -e "${GREEN}✅ $item (removido)${NC}"
    fi
done

# Verificar variáveis de ambiente
echo ""
echo "🔐 Verificando configuração..."
if [ -f ".env.example" ]; then
    echo -e "${GREEN}✅ .env.example presente${NC}"
else
    echo -e "${YELLOW}⚠️  .env.example não encontrado${NC}"
fi

if grep -q "VITE_SUPABASE_URL" easypanel.yml; then
    echo -e "${GREEN}✅ Variáveis Supabase configuradas no easypanel.yml${NC}"
else
    echo -e "${RED}❌ Variáveis Supabase não encontradas no easypanel.yml${NC}"
    ((errors++))
fi

# Resultado final
echo ""
echo "=================================="
if [ $errors -eq 0 ]; then
    echo -e "${GREEN}✅ PROJETO PRONTO PARA DEPLOY!${NC}"
    echo ""
    echo "Próximos passos:"
    echo "1. git add ."
    echo "2. git commit -m 'Deploy ready for Easypanel'"
    echo "3. git push origin main"
    echo "4. Deploy via Easypanel"
else
    echo -e "${RED}❌ $errors erro(s) encontrado(s)${NC}"
    echo "Corrija os problemas antes do deploy"
    exit 1
fi
