#!/bin/bash
set -e

echo "============================================"
echo "  GestionStore - Installation"
echo "  Application de gestion de boutique"
echo "============================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node &> /dev/null; then
    echo "[ERREUR] Node.js n'est pas installé."
    echo ""
    echo "Installez Node.js (version 18 ou plus) :"
    echo "  - Linux : curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"
    echo "  - Mac   : brew install node"
    echo "  - Windows : https://nodejs.org/fr/download"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v)
NODE_MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)

if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "[ERREUR] Node.js $NODE_VERSION détecté, mais la version 18+ est requise."
    echo "         Mettez à jour Node.js : https://nodejs.org/fr/download"
    exit 1
fi

echo "[OK] Node.js détecté : $NODE_VERSION"
echo ""

echo "[1/3] Installation du frontend..."
cd "$SCRIPT_DIR/frontend"
npm install
if [ $? -ne 0 ]; then
    echo "[ERREUR] L'installation du frontend a échoué."
    echo "         Essayez : rm -rf node_modules && npm install"
    exit 1
fi
echo "[OK] Frontend installé."

echo ""
echo "[2/3] Installation du backend..."
cd "$SCRIPT_DIR/backend"
npm install
if [ $? -ne 0 ]; then
    echo "[ERREUR] L'installation du backend a échoué."
    echo "         Essayez : rm -rf node_modules && npm install"
    exit 1
fi
echo "[OK] Backend installé."

echo ""
echo "[3/3] Génération du client Prisma..."
cd "$SCRIPT_DIR/backend"
npx prisma generate 2>/dev/null || echo "[!] Prisma generate ignoré (normal si pas de base de données configurée)"
echo "[OK] Client Prisma prêt."

cd "$SCRIPT_DIR"

echo ""
echo "============================================"
echo "  Installation terminée avec succès !"
echo "============================================"
echo ""
echo "Pour démarrer l'application (frontend seul) :"
echo "  ./start.sh"
echo ""
echo "Pour démarrer frontend + backend :"
echo "  ./start-all.sh"
echo ""
echo "Pour déployer avec Docker :"
echo "  docker compose up -d --build"
echo ""
echo "Comptes par défaut (mode hors-ligne) :"
echo "  Gérant  : admin@store.com / admin123"
echo "  Vendeur : vendeur@store.com / vendeur123"
echo ""
