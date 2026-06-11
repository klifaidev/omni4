@echo off
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js nao encontrado.
    echo Por favor acesse nodejs.org e instale o Node.js
    start https://nodejs.org
    pause
    exit
)
echo App rodando em http://localhost:3000 - Nao feche esta janela enquanto estiver usando o app.
start "" http://localhost:3000
npx serve dist -l 3000
