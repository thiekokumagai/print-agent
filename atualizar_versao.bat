@echo off
echo ==============================================
echo 🚀 INICIANDO BUILD DO PRINT AGENT...
echo ==============================================

call npm run build

echo.
echo ==============================================
echo 📦 COPIANDO PARA A API...
echo ==============================================

copy "dist\print-agent-setup.exe" "..\ecommerce-api\public\downloads\print-agent-setup.exe" /Y

echo.
echo ==============================================
echo ✅ ATUALIZACAO CONCLUIDA COM SUCESSO!
echo O arquivo ja esta pronto na sua API para download.
echo ==============================================
pause
