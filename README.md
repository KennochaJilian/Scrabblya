# Scrabblya

Jeu de lettres Android en famille. Application Expo / React Native / TypeScript et API Node / Express, avec comptes et profils Supabase.

## Mise en service des comptes

Suivre **[api/README.md](api/README.md)** : création du projet Supabase, migration SQL, configuration `.env`, seed du premier administrateur et URL de l’API dans l’app.

```powershell
cd api
npm ci
# Compléter .env à partir de .env.example et appliquer la migration SQL.
npm run seed:admin
npm start
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
- Invitations entre comptes et parties en ligne, avec noms et avatars réels.
- Sauvegardes locales séparées par paire de comptes. Les anciennes parties anonymes restent dans leur clé locale mais ne sont pas automatiquement attribuées à un utilisateur.

## Parties en ligne

Appliquer `supabase/migrations/002_games.sql` après `001_profiles.sql`. L’accueil propose les parties en cours, les invitations et les parties terminées. Le bouton + permet d’inviter un membre ; l’invité accepte ou refuse. L’invitant commence.

Le serveur valide le lexique, les placements, les points, les échanges et les fins avec le même moteur que l’app. L’état complet est privé dans Supabase ; chaque réponse masque le sac et les lettres adverses. Une révision atomique empêche les coups simultanés d’écraser la partie et les identifiants d’action évitent un double envoi après perte de réponse.

L’app actualise une partie ouverte toutes les 5 secondes, l’accueil toutes les 10 secondes, et au retour au premier plan. Seuls les coups validés sont partagés ; aucun placement en direct. Fermer l’app ne supprime pas la partie ; les brouillons non validés ne sont pas conservés.

En développement, laisser l’API tourner avec `npm start` et joindre les téléphones au même réseau que le PC. Un hébergement HTTPS sera nécessaire pour jouer indépendamment du PC. Les notifications push restent à développer.

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

## Hébergement

Image Docker de production, pipeline Azure et stack Portainer : suivre [docs/deployment.md](docs/deployment.md). Le domaine prévu est `scrabblya.aquarius.irish`. Les configurations sont distinctes d’Alexandrya ; le pool Azure et la connexion Docker Hub existants peuvent être autorisés pour ce pipeline.

## APK Android hors store

Le pipeline Azure sélectionne les actions d’après le préfixe du dernier commit : `[api]`, `[apk]` ou `[all]`. Sans préfixe, aucune publication. La branche APK compile une version signée et publie une page HTML à `/telecharger/` sur le VPS. Préparation de Java/SDK, signature Azure Secure Files et configuration Apache : [docs/android-distribution.md](docs/android-distribution.md).

## Intégration Supabase

Le projet réel a été configuré et testé : connexion, comptes, profils, invitations, coups, reprise et fins de partie. Le script opt-in `api/scripts/smoke-games.mjs` crée deux comptes temporaires et leurs parties, vérifie le parcours HTTP réel, puis les supprime. Aucun secret n’est versionné.
