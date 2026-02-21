#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================"
echo "  GestionStore - Lancement en un clic"
echo "============================================"
echo ""
echo "Installation automatique si necessaire, puis demarrage complet..."
echo ""

"$SCRIPT_DIR/start-all.sh"
