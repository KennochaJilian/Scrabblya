# Scrabblya

Jeu de lettres Android en famille. Application Expo / React Native / TypeScript et API Node / Express, avec comptes et profils Supabase.

## Mise en service des comptes

Suivre **[api/README.md](api/README.md)** : création du projet Supabase, migration SQL, configuration `.env`, seed du premier administrateur et URL de l’API dans l’app.

```powershell
cd api
npm ci
# Compléter .env à partir de .env.example et appliquer la migration SQL.
npm run seed:admin
npm run dev
```

Dans un second terminal :

```powershell
cd mobile
npm ci
# Compléter EXPO_PUBLIC_API_URL dans .env à partir de .env.example.
npx expo start --clear
```

Expo SDK 57 pour Expo Go Android. Aucun secret serveur dans l’app.

## Comptes et profils

- Connexion email/mot de passe, session conservée dans le stockage sécurisé Android.
- Rôles admin et utilisateur vérifiés côté serveur.
- Création des comptes via `POST /api/admin/users` ou l’écran admin de l’app.
- Premier admin créé localement par `npm run seed:admin` dans api/.
- Profil avec nom et avatar modifiables ; avatars privés via liens signés.
- Sélection du second joueur dans la liste des vrais comptes ; noms/avatars affichés dans la partie et l’historique.
- Sauvegardes locales séparées par paire de comptes. Les anciennes parties anonymes restent dans leur clé locale mais ne sont pas automatiquement attribuées à un utilisateur.

## Jeu local

Plateau classique, glisser-déposer plateau/chevalet, réarrangement du chevalet, validation des mots et croisements, bonus, jokers, pioche française, échanges, passes, historique et fin de partie avec reliquats. Lexique hors ligne de 405 616 mots Grammalecte 7.7 sous MPL 2.0 : [détails](docs/lexique.md).

Les tours validés sont enregistrés sur le téléphone. Les brouillons non validés ne sont pas conservés après fermeture.

## Mode développeur

Menu de partie → Mode développeur : égalité 200/200, victoire J1 240/200, victoire J2 200/240, Scrabble MAISONS à poser ou prêt à valider (66 points dont 50 de bonus). Les essais n’écrasent pas la sauvegarde normale. Revenir à ma partie restaure aussi le brouillon de la session.

## Vérifications

```powershell
npm --prefix api test
npm --prefix api run check
npm --prefix mobile test
npm --prefix mobile run typecheck
npm --prefix mobile run lint
```

Pour compiler le bundle Android : `cd mobile` puis `npx expo export --platform android`.

## Reste à activer

Le projet Supabase n’est pas encore créé : aucune connexion réelle ni création d’admin n’a été effectuée sur un service distant. Les fichiers, migrations et tests sont prêts pour ce branchement.

Le jeu reste à deux sur le même téléphone. Synchronisation des parties et notifications push entre appareils restent à développer.
