# Guide Utilisateur GestionStore

## 1. Connexion

1. Ouvrir l'application
2. Saisir email et mot de passe
3. Cliquer sur `Se connecter`

Notes:
- Si internet/backend indisponible, l'application passe en mode hors ligne.
- Les operations restent utilisables localement et seront synchronisees plus tard.

## 2. Roles et permissions

### Gerant
- Acces complet (produits, depenses, rapports, utilisateurs, parametres)
- Peut creer/desactiver des utilisateurs

### Vendeur
- Acces limite a l'operationnel (ventes, clients, commandes clients, retours selon config)
- Pas d'acces a la gestion complete des utilisateurs

## 3. Flux metier principal

### Approvisionnement (entree de stock)
1. Aller dans `Commandes fournisseurs`
2. Creer une commande
3. Valider/recevoir la commande
4. Le stock augmente automatiquement

### Vente (sortie de stock)
1. Aller dans `Ventes`
2. Ajouter les produits
3. Finaliser la vente
4. Le stock diminue automatiquement

### Retours / ajustements
- A faire depuis `Mouvements de stock` (actions manuelles autorisees)

## 4. Credits

### Credits clients
- Une commande/vente peut etre en credit
- Les encaissements partiels et remboursements sont traces

### Credits fournisseurs
- Les dettes fournisseurs sont suivies dans les operations fournisseurs

## 5. Rapports

La page `Rapports` affiche:
- Entrees de tresorerie
- Sorties de tresorerie
- Resultat net
- Listes de credits clients et credits fournisseurs

Conseil:
- Utiliser les filtres de dates pour controler une periode precise.

## 6. Utilisation sur plusieurs appareils

1. Lancer `one-click.bat` (ou `./one-click.sh`) sur le PC principal
2. Connecter tous les appareils au meme Wi-Fi
3. Depuis `Parametres`, copier l'adresse reseau du PC principal
4. Ouvrir cette adresse sur le telephone/autre PC

## 7. Bonnes pratiques

- Ne pas modifier le stock directement a la creation produit
- Passer par:
1. commande fournisseur validee
2. retour client
3. ajustement manuel justifie

- Faire une synchronisation reguliere depuis `Parametres`
- Verifier les rapports de fin de journee

## 8. Resolution de problemes

- Login possible mais pas de nouvelles donnees:
1. Verifier que le backend tourne
2. Verifier l'URL de sync
3. Lancer une synchronisation manuelle

- Un utilisateur ne voit pas les donnees:
1. Verifier qu'il est rattache au bon gerant
2. Verifier qu'il est actif
3. Relancer la sync
