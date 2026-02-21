# GestionStore

Application de gestion de boutique (PWA) avec mode en ligne/hors ligne.

## Demarrage en un clic

### Windows
1. Double-cliquer sur `one-click.bat`
2. Le script installe automatiquement les dependances si besoin
3. Puis il lance backend + frontend

### Linux / Mac
1. Donner les droits d'execution:
```bash
chmod +x one-click.sh start-all.sh install.sh
```
2. Lancer:
```bash
./one-click.sh
```

## URLs

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## Comptes par defaut (hors ligne)

- Gerant: `admin@store.com` / `admin123`
- Vendeur: `vendeur@store.com` / `vendeur123`

## Scripts utiles

- `install.bat` / `install.sh`: installe frontend + backend
- `start.bat` / `start.sh`: lance frontend seul
- `start-all.bat` / `start-all.sh`: lance frontend + backend (avec installation auto si manquante)
- `one-click.bat` / `one-click.sh`: installation + lancement en une seule action

## Installation manuelle (optionnelle)

### Prerequis
- Node.js 18+
- PostgreSQL (si vous utilisez la sync backend)

### Commandes
```bash
# racine du projet
cd frontend && npm install
cd ../backend && npm install
```

Configurer ensuite `backend/.env` puis lancer:
```bash
# terminal 1
cd backend
npm run dev

# terminal 2
cd frontend
npm run dev -- --host 0.0.0.0
```

## Guide utilisateur

Voir `GUIDE_UTILISATEUR.md`.

## Depannage rapide

- Si la sync ne marche pas:
1. Verifier backend sur `http://localhost:3001/api/health`
2. Verifier l'URL serveur dans Parametres
3. Relancer `one-click.bat` (Windows) ou `./one-click.sh` (Linux/Mac)

- Si un port est deja pris:
```bash
# Windows
netstat -ano | findstr :5173
netstat -ano | findstr :3001
```
