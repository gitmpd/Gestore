#!/bin/bash
echo "============================================"
echo "  GestionStore - Démarrage complet"
echo "  Frontend + Backend"
echo "============================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "frontend/node_modules" ] || [ ! -d "backend/node_modules" ]; then
    echo "[!] Dependances manquantes. Installation automatique..."
    "$SCRIPT_DIR/install.sh"
    if [ $? -ne 0 ]; then
        echo "[ERREUR] Installation automatique echouee."
        exit 1
    fi
fi

if [ ! -f "backend/.env" ]; then
    echo "[!] Le fichier backend/.env n'existe pas."
    echo "    Création depuis .env.example..."
    cp backend/.env.example backend/.env
    echo "[OK] backend/.env créé. Modifiez-le si nécessaire."
    echo ""
fi

echo "Preparation de la base de donnees..."
DB_URL=$(grep -E '^DATABASE_URL=' backend/.env | head -n 1 | cut -d= -f2- | sed 's/^"//; s/"$//')
if [ -z "$DB_URL" ]; then
    echo "[ERREUR] DATABASE_URL introuvable dans backend/.env"
    exit 1
fi

DB_NAME=$(echo "$DB_URL" | sed -E 's#^postgresql://[^/]+/([^?]+).*$#\1#')
ADMIN_DB_URL=$(echo "$DB_URL" | sed -E 's#^postgresql://([^/]+)/[^?]+.*$#postgresql://\1/postgres#')

if ! command -v psql >/dev/null 2>&1; then
    echo "[ERREUR] psql n'est pas disponible. Installez PostgreSQL ou ajoutez psql au PATH."
    exit 1
fi

DB_EXISTS=$(psql "$ADMIN_DB_URL" -t -A -c "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}';" 2>/dev/null | tr -d '[:space:]')
if [ "$DB_EXISTS" != "1" ]; then
    echo "[INFO] Creation de la base \"$DB_NAME\"..."
    psql "$ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DB_NAME\";" >/dev/null
    echo "[OK] Base creee."
else
    echo "[OK] Base \"$DB_NAME\" deja presente."
fi

echo "[INFO] Prisma db push..."
(
  cd "$SCRIPT_DIR/backend"
  npx prisma db push
)
if [ $? -ne 0 ]; then
    echo "[ERREUR] Echec de \"npx prisma db push\"."
    exit 1
fi

echo "[INFO] Seed initial..."
(
  cd "$SCRIPT_DIR/backend"
  npm run db:seed
)
if [ $? -ne 0 ]; then
    echo "[ERREUR] Echec de db:seed."
    exit 1
fi
echo "[OK] Base preparee."
echo ""

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
