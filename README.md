# Scrabblya

Jeu de lettres sur Android pour jouer en famille, dans la continuité d’Alexandrya.

## Périmètre prévu

- Jusqu’à 10 utilisateurs, avec comptes sur invitation et connexion par email et mot de passe.
- Plateau classique de 15 × 15 cases, cases bonus, pioche et validation des mots.
- Parties au tour par tour sauvegardées sur le serveur, reprises après fermeture de l’application.
- Notifications Android après chaque coup validé.
- Pas de diffusion des placements en direct.

## Technologies envisagées

- React Native, Expo et TypeScript pour l’application Android.
- Supabase pour l’authentification, les parties et la validation des coups côté serveur.
- SMTP Google existant pour les emails d’authentification.
- Notifications push pour prévenir les joueurs.

## État du projet

Dépôt initialisé. L’application et la configuration des services restent à créer.
Le lexique autorisé et ses conditions d’utilisation restent à choisir.
