#!/bin/bash
echo "============================================"
echo "  GestionStore - Démarrage complet"
echo "  Frontend + Backend"
echo "============================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "frontend/node_modules" ]; then
    echo "[!] Les dépendances ne sont pas installées."
    echo "    Lancez d'abord : ./install.sh"
    exit 1
fi

if [ ! -f "backend/.env" ]; then
    echo "[!] Le fichier backend/.env n'existe pas."
    echo "    Création depuis .env.example..."
    cp backend/.env.example backend/.env
    echo "[OK] backend/.env créé. Modifiez-le si nécessaire."
    echo ""
fi

LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "non disponible")

echo "[1/2] Démarrage du backend (port 3001)..."
cd "$SCRIPT_DIR/backend" && npm run dev &
BACKEND_PID=$!

sleep 3

if ! kill -0 $BACKEND_PID 2>/dev/null; then
    echo ""
    echo "[ERREUR] Le backend n'a pas réussi à démarrer."
    echo "         Vérifiez la configuration dans backend/.env"
    echo "         et que PostgreSQL est lancé."
    echo ""
    echo "         Le frontend va démarrer seul (mode hors-ligne)."
    echo ""
fi

echo "[2/2] Démarrage du frontend (port 5173)..."
cd "$SCRIPT_DIR/frontend" && npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!

sleep 2

echo ""
echo "============================================"
echo "  Tout est lancé !"
echo ""
echo "  Frontend : http://localhost:5173"
echo "  Backend  : http://localhost:3001"
echo "  Réseau   : http://${LOCAL_IP}:5173"
echo ""
echo "  Comptes par défaut :"
echo "  Gérant  : admin@store.com / admin123"
echo "  Vendeur : vendeur@store.com / vendeur123"
echo ""
echo "  Appuyez sur Ctrl+C pour tout arrêter."
echo "============================================"

cleanup() {
    echo ""
    echo "Arrêt des services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "Terminé."
    exit 0
}

trap cleanup SIGINT SIGTERM

wait
