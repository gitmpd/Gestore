# GestionStore

Application de gestion de boutique (PWA) avec mode en ligne/hors ligne.

## Demarrage en un clic

### Multi-OS (Windows / Linux / Mac)
Une seule commande (start/stop) avec verification prerequis, creation DB, `prisma db push`, seed, lancement backend+frontend et ouverture navigateur:

```bash
npm run app:start
```

Arret:

```bash
npm run app:stop
```

### Windows
1. Double-cliquer sur `Lancer-GestionStore.bat`
2. Pour arreter: double-cliquer sur `Arreter-GestionStore.bat`

## URLs

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

## Comptes par defaut (hors ligne)

- Gerant: `admin@store.com` / `admin123`
- Vendeur: `vendeur@store.com` / `vendeur123`

## Scripts utiles

- `Lancer-GestionStore.bat` / `Arreter-GestionStore.bat`: lancement/arret Windows (double-clic)
- `gestionstore-app.ps1 -Action start|stop`: controleur Windows
- `npm run app:start` / `npm run app:stop`: controleur cross-platform

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
3. Relancer `Lancer-GestionStore.bat` (Windows) ou `npm run app:start`

- Si un port est deja pris:
```bash
# Windows
netstat -ano | findstr :5173
netstat -ano | findstr :3001
```
