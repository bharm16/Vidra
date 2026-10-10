#!/bin/bash
# Debug Mode Setup Script
# Run this to enable comprehensive logging across the stack

echo "🔍 Enabling Debug Mode for Prompt Builder"
echo "=========================================="

# Check if .env exists
if [ ! -f .env ]; then
  echo "❌ .env file not found."
  echo "   Create a .env file first (see CLAUDE.md)."
  echo "   The required-var schema lives in server/src/config/env.ts."
  exit 1
fi

# Backup current .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo "✅ Backed up .env"

# Enable debug logging
if grep -q "^LOG_LEVEL=" .env; then
  sed -i '' 's/^LOG_LEVEL=.*/LOG_LEVEL=debug/' .env 2>/dev/null || \
  sed -i 's/^LOG_LEVEL=.*/LOG_LEVEL=debug/' .env
  echo "✅ Set LOG_LEVEL=debug"
else
  echo "LOG_LEVEL=debug" >> .env
  echo "✅ Added LOG_LEVEL=debug"
fi

# Enable client-side debug logging
if grep -q "^VITE_DEBUG_LOGGING=" .env; then
  sed -i '' 's/^VITE_DEBUG_LOGGING=.*/VITE_DEBUG_LOGGING=true/' .env 2>/dev/null || \
  sed -i 's/^VITE_DEBUG_LOGGING=.*/VITE_DEBUG_LOGGING=true/' .env
  echo "✅ Set VITE_DEBUG_LOGGING=true"
else
  echo "VITE_DEBUG_LOGGING=true" >> .env
  echo "✅ Added VITE_DEBUG_LOGGING=true"
fi

# Enable verbose log level for client
if grep -q "^VITE_LOG_LEVEL=" .env; then
  sed -i '' 's/^VITE_LOG_LEVEL=.*/VITE_LOG_LEVEL=debug/' .env 2>/dev/null || \
  sed -i 's/^VITE_LOG_LEVEL=.*/VITE_LOG_LEVEL=debug/' .env
  echo "✅ Set VITE_LOG_LEVEL=debug"
else
  echo "VITE_LOG_LEVEL=debug" >> .env
  echo "✅ Added VITE_LOG_LEVEL=debug"

fi

# Enable verbose stack metadata
if grep -q '^LOG_STACK_LEVELS=' .env; then
  sed -i '' 's/^LOG_STACK_LEVELS=.*/LOG_STACK_LEVELS=debug,info,warn,error/' .env 2>/dev/null || \
  sed -i 's/^LOG_STACK_LEVELS=.*/LOG_STACK_LEVELS=debug,info,warn,error/' .env
  echo "✅ Set LOG_STACK_LEVELS=debug,info,warn,error"
else
  echo 'LOG_STACK_LEVELS=debug,info,warn,error' >> .env
  echo "✅ Added LOG_STACK_LEVELS=debug,info,warn,error"
fi

if grep -q '^VITE_LOG_STACK_LEVELS=' .env; then
  sed -i '' 's/^VITE_LOG_STACK_LEVELS=.*/VITE_LOG_STACK_LEVELS=debug,info,warn,error/' .env 2>/dev/null || \
  sed -i 's/^VITE_LOG_STACK_LEVELS=.*/VITE_LOG_STACK_LEVELS=debug,info,warn,error/' .env
  echo "✅ Set VITE_LOG_STACK_LEVELS=debug,info,warn,error"
else
  echo 'VITE_LOG_STACK_LEVELS=debug,info,warn,error' >> .env
  echo "✅ Added VITE_LOG_STACK_LEVELS=debug,info,warn,error"
fi

echo ""
echo "=========================================="
echo "Debug mode enabled!"
echo ""
echo "To start with logging:"
echo "  npm run dev"
echo ""
echo "Backend logs: Check terminal running the server"
echo "Frontend logs: Open browser DevTools → Console"
echo ""
echo "To view stored frontend logs:"
echo "  window.__logger.getStoredLogs()"
echo ""
echo "To export logs for bug reports:"
echo "  window.__logger.exportLogs()"
echo ""
echo "To disable debug mode later:"
echo "  ./scripts/disable-debug.sh"
echo "  OR restore from backup: cp .env.backup.* .env"
echo "=========================================="
