# GestionStore — Application de Gestion de Boutique

Application web progressive (PWA) pour la gestion d'une boutique, fonctionnant **en ligne et hors ligne**.

> &copy; Djamatigui 2026

---

## Fonctionnalités

- **Gestion des produits** : catalogue, catégories, codes-barres, prix achat/vente
- **Gestion du stock** : mouvements (entrées/sorties/ajustements/retours), alertes stock bas
- **Point de vente** : ventes rapides, panier, paiement (espèces/crédit/mobile money)
- **Gestion des clients** : fiche client, système de crédit, historique des transactions, commandes
- **Gestion des fournisseurs** : fiches, commandes, réception de marchandise
- **Gestion des dépenses** : suivi des dépenses de la boutique
- **Rapports** : ventes par jour/semaine/mois, bénéfices, graphiques, export
- **Rôles** : Gérant (accès complet) et Vendeur (accès limité)
- **Journal d'activité** : audit de toutes les actions (qui a fait quoi et quand)
- **Mode hors ligne** : données stockées localement (IndexedDB), synchronisation automatique
- **PWA** : installable sur mobile et desktop comme une application native
- **Thème sombre/clair** : basculement automatique ou manuel

---

## Table des matières

1. [Installation rapide (sans serveur)](#installation-rapide-sans-serveur)
2. [Installation avec Docker (recommandé pour la production)](#installation-avec-docker)
3. [Installation manuelle complète (frontend + backend)](#installation-manuelle-complète)
4. [Accès depuis d'autres ordinateurs du réseau](#accès-depuis-dautres-ordinateurs-du-réseau)
5. [Structure du projet](#structure-du-projet)
6. [Stack technique](#stack-technique)
7. [Dépannage](#dépannage)

---

## Installation rapide (sans serveur)

Cette méthode lance uniquement le **frontend** en mode hors-ligne. Aucune base de données ni serveur requis. Idéal pour un usage sur un seul PC.

### Prérequis

- **Node.js** version 18 ou plus récente

**Pour installer Node.js :**

| Système | Commande |
|---------|----------|
| **Linux (Ubuntu/Debian)** | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash - && sudo apt-get install -y nodejs` |
| **Windows** | Télécharger depuis [nodejs.org](https://nodejs.org/fr/download) et suivre l'installateur |
| **Mac** | `brew install node` |

Vérifier l'installation :

```bash
node -v    # doit afficher v18.x.x ou plus
npm -v     # doit afficher un numéro de version
```

### Étape 1 : Copier le projet

Copiez le dossier `GestionStore` sur le nouvel ordinateur (clé USB, zip, transfert réseau, ou `git clone`).

### Étape 2 : Installer les dépendances

**Linux / Mac :**

```bash
cd GestionStore
chmod +x install.sh
./install.sh
```

**Windows :**

Double-cliquez sur `install.bat` ou dans l'invite de commandes :

```cmd
cd GestionStore
install.bat
```

### Étape 3 : Démarrer l'application

**Linux / Mac :**

```bash
./start.sh
```

**Windows :**

Double-cliquez sur `start.bat`

### Étape 4 : Ouvrir dans le navigateur

Ouvrez votre navigateur (Chrome, Edge, Firefox) et allez sur :

```
http://localhost:5173
```

**Comptes par défaut (mode hors-ligne) :**

| Rôle    | Email              | Mot de passe |
|---------|--------------------|--------------|
| Gérant  | admin@store.com    | admin123     |

> Après connexion, allez dans **Paramètres > Données** et cliquez **"Charger les données de test"** pour remplir l'application avec des exemples.

---

## Installation avec Docker

Cette méthode déploie **tout le système** (frontend + backend + base de données PostgreSQL) avec une seule commande. Recommandé pour la production ou un usage multi-PC.

### Prérequis

- **Docker** et **Docker Compose** installés

**Pour installer Docker :**

| Système | Instructions |
|---------|-------------|
| **Linux (Ubuntu/Debian)** | `curl -fsSL https://get.docker.com \| sh && sudo usermod -aG docker $USER` (redémarrer la session après) |
| **Windows** | Télécharger [Docker Desktop](https://www.docker.com/products/docker-desktop/) |
| **Mac** | Télécharger [Docker Desktop](https://www.docker.com/products/docker-desktop/) ou `brew install --cask docker` |

Vérifier l'installation :

```bash
docker --version          # doit afficher Docker version 20+
docker compose version    # doit afficher un numéro de version
```

### Étape 1 : Configurer l'environnement

```bash
cd GestionStore
cp .env.example .env
```

Modifiez le fichier `.env` pour changer les mots de passe par défaut :

```env
DB_PASSWORD=votre_mot_de_passe_securise
JWT_SECRET=une-longue-chaine-aleatoire-secrete
JWT_REFRESH_SECRET=une-autre-chaine-aleatoire
```

### Étape 2 : Lancer les conteneurs

```bash
docker compose up -d --build
```

Cette commande va :
1. Construire les images Docker du frontend et du backend
2. Démarrer la base de données PostgreSQL
3. Exécuter les migrations de la base de données
4. Lancer le backend sur le port 3001
5. Lancer le frontend sur le port 80

### Étape 3 : Créer le premier utilisateur

```bash
docker compose exec backend npx tsx src/seed.ts
```

### Étape 4 : Accéder à l'application

Ouvrez votre navigateur sur :

```
http://localhost
```

**Compte admin par défaut :**

| Rôle   | Email           | Mot de passe |
|--------|-----------------|--------------|
| Gérant | admin@store.com | admin123     |

### Commandes Docker utiles

```bash
docker compose up -d          # Démarrer en arrière-plan
docker compose down           # Arrêter les conteneurs
docker compose logs -f        # Voir les logs en temps réel
docker compose logs backend   # Logs du backend uniquement
docker compose restart        # Redémarrer tous les services
docker compose ps             # État des conteneurs

# Sauvegarder la base de données
docker compose exec db pg_dump -U postgres gestionstore > backup.sql

# Restaurer une sauvegarde
cat backup.sql | docker compose exec -T db psql -U postgres gestionstore
```

---

## Installation manuelle complète

Si vous voulez lancer le frontend **et** le backend sans Docker (pour le développement ou la synchronisation multi-PC).

### Prérequis

- **Node.js** version 18+
- **PostgreSQL** version 14+ installé et lancé

**Pour installer PostgreSQL :**

| Système | Instructions |
|---------|-------------|
| **Linux (Ubuntu/Debian)** | `sudo apt install postgresql postgresql-client` |
| **Windows** | Télécharger depuis [postgresql.org](https://www.postgresql.org/download/windows/) |
| **Mac** | `brew install postgresql@16 && brew services start postgresql@16` |

Créer la base de données :

```bash
sudo -u postgres psql -c "CREATE DATABASE gestionstore;"
```

### Étape 1 : Installer les dépendances

```bash
cd GestionStore
./install.sh     # Linux/Mac
install.bat      # Windows
```

### Étape 2 : Configurer le backend

```bash
cd backend
cp .env.example .env
```

Modifiez `backend/.env` si nécessaire :

```env
DATABASE_URL="postgresql://postgres:votre_mdp@localhost:5432/gestionstore?schema=public"
JWT_SECRET="une-longue-chaine-aleatoire"
JWT_REFRESH_SECRET="une-autre-chaine-aleatoire"
PORT=3001
```

### Étape 3 : Initialiser la base de données

```bash
cd backend
npx prisma migrate deploy    # Créer les tables
npm run db:seed              # Créer l'utilisateur admin
```

### Étape 4 : Démarrer tout

**Linux / Mac :**

```bash
./start-all.sh
```

**Windows :**

Double-cliquez sur `start-all.bat`

**Manuellement (2 terminaux séparés) :**

Terminal 1 — Backend :

```bash
cd backend
npm run dev
```

Terminal 2 — Frontend :

```bash
cd frontend
npm run dev -- --host 0.0.0.0
```

### Étape 5 : Configurer la synchronisation

1. Ouvrir l'application sur `http://localhost:5173`
2. Aller dans **Paramètres > Synchronisation**
3. Entrer l'URL du serveur : `http://localhost:3001`
4. Activer la synchronisation

---

## Accès depuis d'autres ordinateurs du réseau

Si plusieurs PC sont sur le **même réseau Wi-Fi/LAN**, les autres machines peuvent accéder à l'application sans installation :

1. Sur le PC serveur, lancez l'application (le script `start.sh` affiche l'adresse IP locale)
2. Sur les autres PC, ouvrir dans un navigateur :
   - **Mode Docker** : `http://<IP_DU_SERVEUR>` (port 80)
   - **Mode développement** : `http://<IP_DU_SERVEUR>:5173`
3. Chrome/Edge proposera d'**installer l'application** comme une app native (icône dans la barre d'adresse)

Pour connaître l'IP du serveur :

```bash
# Linux
hostname -I | awk '{print $1}'

# Windows
ipconfig | findstr "IPv4"

# Mac
ipconfig getifaddr en0
```

---

## Structure du projet

```
GestionStore/
├── frontend/               # Application React PWA
│   ├── public/             # Assets PWA (icônes, logo)
│   ├── src/
│   │   ├── components/     # Composants réutilisables (UI, Layout)
│   │   ├── db/             # Base de données IndexedDB (Dexie)
│   │   ├── hooks/          # Hooks React personnalisés
│   │   ├── lib/            # Utilitaires (export, reçus, validation)
│   │   ├── pages/          # Pages de l'application
│   │   ├── services/       # Services (sync, audit, découverte)
│   │   ├── stores/         # État global (Zustand)
│   │   └── types/          # Types TypeScript
│   ├── Dockerfile          # Image Docker du frontend
│   ├── nginx.conf          # Config Nginx (production Docker)
│   └── package.json
├── backend/                # API REST Express + Prisma
│   ├── prisma/
│   │   ├── schema.prisma   # Schéma de la base de données
│   │   └── migrations/     # Migrations SQL
│   ├── src/
│   │   ├── routes/         # Routes API (auth, produits, ventes...)
│   │   ├── middleware/      # Auth JWT, gestion d'erreurs
│   │   ├── seed.ts         # Données initiales (admin)
│   │   └── index.ts        # Point d'entrée du serveur
│   ├── Dockerfile          # Image Docker du backend
│   └── package.json
├── docker-compose.yml      # Orchestration Docker (frontend + backend + DB)
├── .env.example            # Variables d'environnement Docker
├── install.sh              # Script d'installation (Linux/Mac)
├── install.bat             # Script d'installation (Windows)
├── start.sh                # Démarrer le frontend uniquement (Linux/Mac)
├── start.bat               # Démarrer le frontend uniquement (Windows)
├── start-all.sh            # Démarrer frontend + backend (Linux/Mac)
├── start-all.bat           # Démarrer frontend + backend (Windows)
└── README.md               # Ce fichier
```

---

## Stack technique

| Couche | Technologies |
|--------|-------------|
| **Frontend** | React 19, TypeScript, Vite 7, Tailwind CSS 4, Dexie.js (IndexedDB), Zustand, Recharts, Lucide Icons |
| **Backend** | Node.js, Express 5, TypeScript, Prisma 6, Zod (validation) |
| **Base de données** | PostgreSQL 16 (serveur), IndexedDB (client hors-ligne) |
| **PWA** | vite-plugin-pwa (Workbox), Service Workers |
| **Authentification** | JWT (access + refresh tokens), bcrypt |
| **Déploiement** | Docker, Docker Compose, Nginx |

---

## Dépannage

### "Node.js n'est pas installé"

Installez Node.js depuis [nodejs.org](https://nodejs.org/fr/download) (version 18 minimum).

### "npm install échoue"

```bash
# Nettoyer le cache npm
npm cache clean --force

# Supprimer node_modules et réinstaller
rm -rf frontend/node_modules backend/node_modules
./install.sh
```

### "L'application ne se lance pas sur le port 5173"

Un autre programme utilise peut-être le port. Vérifiez :

```bash
# Linux/Mac
lsof -i :5173

# Windows
netstat -ano | findstr :5173
```

### "Impossible de se connecter à PostgreSQL"

```bash
# Vérifier que PostgreSQL est lancé
sudo systemctl status postgresql    # Linux
brew services list                   # Mac

# Vérifier la connexion
psql -U postgres -c "SELECT 1;"
```

### "Docker compose échoue"

```bash
# Vérifier que Docker est lancé
docker info

# Reconstruire les images
docker compose down
docker compose up -d --build

# Voir les logs pour identifier l'erreur
docker compose logs -f
```

### "Les données ne se synchronisent pas"

1. Vérifier que le backend est accessible : `curl http://localhost:3001/api/health`
2. Dans l'application, aller dans **Paramètres > Synchronisation** et vérifier l'URL
3. Vérifier les logs du backend pour les erreurs

### "Permission denied sur les scripts .sh"

```bash
chmod +x install.sh start.sh start-all.sh
```
#   G e s t o r e 
 
 
