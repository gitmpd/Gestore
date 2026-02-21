#!/bin/bash
echo "============================================"
echo "  GestionStore - Démarrage (Frontend)"
echo "============================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "frontend/node_modules" ]; then
    echo "[!] Les dépendances ne sont pas installées."
    echo "    Lancez d'abord : ./install.sh"
    exit 1
fi

LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "non disponible")

echo "Démarrage du frontend..."
echo ""
echo "  L'application sera accessible sur :"
echo "  ➜ Local  : http://localhost:5173"
echo "  ➜ Réseau : http://${LOCAL_IP}:5173"
echo ""
echo "  Comptes par défaut :"
echo "  Gérant  : admin@store.com / admin123"
echo "  Vendeur : vendeur@store.com / vendeur123"
echo ""
echo "  Appuyez sur Ctrl+C pour arrêter."
echo "============================================"
echo ""

cd "$SCRIPT_DIR/frontend" && npm run dev -- --host 0.0.0.0
