# Scrabblya

Jeu de lettres Android pour jouer en famille, dans la continuité d’Alexandrya.

## Démarrage

Node 22.13 ou ultérieur. Expo SDK 57, compatible avec Expo Go du Play Store au 18 octobre 2026.

```powershell
cd mobile
npm ci
npx expo start --clear
```

Dans Expo Go : **Accéder au jeu local**, puis **Jouer ou reprendre une partie**.

## Partie locale jouable

- Deux joueurs se passent le téléphone ; leur chevalet est masqué entre les tours.
- Glisser-déposer des lettres, placement par deux touchers et reprise du brouillon.
- Validation des placements et de tous les mots croisés, avec aperçu du score.
- Bonus classiques, bonus de 50 points pour sept lettres, jokers à zéro point.
- Pioche de 102 lettres selon la distribution française, sept lettres par joueur.
- Échanges si au moins sept lettres restent dans le sac ; choix des lettres échangées.
- Fin sur chevalet épuisé et sac vide, ou six passes consécutives, avec décompte des reliquats.
- Partie et historique sauvegardés sur le téléphone dès la création puis après chaque tour validé. Les brouillons non validés ne sont pas conservés.
- Une seule partie locale à la fois. Une nouvelle partie demande confirmation avant de remplacer la précédente.

Le lexique embarqué contient 405 616 formes issues de Grammalecte 7.7 sous MPL 2.0. Voir [la politique de lexique](docs/lexique.md) et les notices dans mobile/vendor/grammalecte/.

## Architecture

`mobile/src/engine.ts` est un moteur TypeScript pur : aucune dépendance native, ni réseau. Il pourra être réutilisé côté serveur. Les actions renvoient un nouvel état ; une action refusée ne consomme pas le tour et ne modifie pas la partie.

`mobile/src/LocalGame.tsx` relie le moteur, le lexique et la sauvegarde AsyncStorage. Les écritures sont sérialisées et le passage de tour n’est affiché qu’après réussite de la sauvegarde.

## Vérifications

```powershell
cd mobile
npm test
npm run typecheck
npm run lint
npx expo export --platform android
```

Le bundle Android compile. Le ressenti des gestes et la reprise après fermeture doivent encore être vérifiés sur un vrai téléphone.

## Prochaine étape

Connexion Supabase, comptes sur invitation, parties entre téléphones et notifications push. L’écran de connexion reste visuel : aucun serveur ni secret SMTP n’est configuré. La sauvegarde actuelle reste locale et ne synchronise pas les téléphones.

Les ressources visuelles sont reprises d’Alexandrya. Les alertes de dépendances Expo existantes sont consignées dans docs/verification.md avant distribution.
