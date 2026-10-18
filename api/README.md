# API Scrabblya — mise en service

Node 22.13 ou ultérieur. L’API utilise Supabase Auth pour les mots de passe, PostgreSQL pour les profils et un bucket privé pour les avatars. Aucun mot de passe n’est enregistré dans la table des profils.

## 1. Créer le projet Supabase

Créer un projet dédié à Scrabblya, par exemple dans une région européenne. Dans le SQL Editor, exécuter `supabase/migrations/001_profiles.sql`, puis `supabase/migrations/002_games.sql`, à la racine du dépôt.

Dans Authentication, désactiver les inscriptions publiques (Allow new users to sign up). Les comptes seront créés par l’API administrateur et le seed. Les emails des comptes créés manuellement sont marqués confirmés ; aucun SMTP n’est nécessaire pour cette création. Le SMTP de la bibliothèque n’a pas été copié.

Récupérer l’URL du projet, la clé publishable/anon et la clé serveur service_role/secret. La clé serveur reste exclusivement dans `api/.env`.

## 2. Configurer et démarrer

```powershell
cd C:\Users\codin\Documents\Scrabblya\api
npm ci
Copy-Item .env.example .env
```

Compléter `.env` :

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (au moins 12 caractères)

```powershell
npm run seed:admin
npm start
```

Le seed est idempotent : un administrateur existant est conservé avec son mot de passe actuel. Un utilisateur ordinaire n’est jamais promu silencieusement. Le script ne révèle pas le mot de passe. Si une création Auth réussit mais pas l’insertion du profil, le service tente de supprimer le compte Auth créé.

`GET http://localhost:3001/health` doit renvoyer `{"status":"ok"}`. Cela vérifie le serveur, pas la connexion à Supabase. Le test réel consiste ensuite à se connecter avec le compte seedé.

## 3. Configurer Android

```powershell
cd C:\Users\codin\Documents\Scrabblya\mobile
Copy-Item .env.example .env
```

Dans `mobile/.env`, définir :

```dotenv
EXPO_PUBLIC_API_URL=http://ADRESSE_IPV4_DU_PC:3001/api
```

Le téléphone et le PC doivent pouvoir se joindre sur le réseau local ; `localhost` sur le téléphone désigne le téléphone, pas le PC. Au besoin autoriser le port 3001 sur le réseau privé Windows. Redémarrer Expo après toute modification de cette variable :

```powershell
npx expo start --clear
```

La seule variable publiée dans l’app est l’URL de l’API. Aucun secret Supabase ne doit apparaître dans une variable `EXPO_PUBLIC_*`. Pour un serveur distant, utiliser une URL HTTPS. `TRUST_PROXY_HOPS` ne se configure que si le déploiement utilise réellement un proxy de confiance.

## Routes

Toutes les routes sauf login/refresh et health exigent `Authorization: Bearer <accessToken>`.

| Méthode et chemin | Accès | Données |
|---|---|---|
| `GET /health` | Public | État du serveur |
| `POST /api/auth/login` | Public, limité en tentatives | `{email,password}` |
| `POST /api/auth/refresh` | Public, limité | `{refreshToken}` |
| `POST /api/auth/logout` | Connecté | Invalide le renouvellement de cette session |
| `GET /api/me` | Connecté | Profil avec email |
| `PATCH /api/me` | Connecté | `{name}` uniquement |
| `POST /api/me/avatar` | Connecté | Multipart, champ `avatar`, PNG/JPEG/WebP, 2 Mo max |
| `GET /api/users` | Connecté | Joueurs, noms, rôles et liens signés d’avatar ; emails visibles uniquement à l’admin |
| `POST /api/admin/users` | Admin | `{name,email,password}`, crée un utilisateur ordinaire |
| `PUT /api/admin/users/:id/password` | Admin | `{password}`, réinitialisation manuelle |

Réponse login et refresh : `{accessToken,refreshToken,expiresAt,user}`. Le profil expose `{id,name,email?,role,avatarUrl}`. L’absence d’avatar donne `null` et l’app affiche l’initiale du nom. Les liens d’avatar sont signés pour une heure et renouvelés lors de la récupération du profil ou de la liste.

Exemple PowerShell de création manuelle (les mots de passe sont fournis via des variables d’environnement, pas dans le script) :

```powershell
$loginBody = @{ email = $env:SEED_ADMIN_EMAIL; password = $env:SEED_ADMIN_PASSWORD } | ConvertTo-Json
$loginResult = Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/auth/login -ContentType application/json -Body $loginBody
$userBody = @{ name = 'Nathalie'; email = 'nathalie@example.com'; password = $env:INITIAL_USER_PASSWORD } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/admin/users -Headers @{ Authorization = "Bearer $($loginResult.accessToken)" } -ContentType application/json -Body $userBody
```

L’admin peut aussi créer les comptes dans l’écran **Gestion des utilisateurs** de l’app. Un utilisateur peut modifier son nom et son avatar dans **Mon profil**. Le mot de passe oublié passe pour cette version par une réinitialisation manuelle administrateur, pas par un lien email.

## Contrôle des accès

Le rôle est relu dans PostgreSQL après vérification du jeton par Supabase ; il n’est pas accepté depuis le client ou les métadonnées de l’utilisateur. RLS est activé et les tables/buckets ne disposent pas de politiques de modification pour les clients. Le serveur utilise sa clé privilégiée après authentification et vérifie le propriétaire des modifications de profil/avatar. Une tentative d’envoyer `role` dans le formulaire utilisateur est rejetée.

Les jetons d’accès expirent selon Supabase. La déconnexion supprime immédiatement la session locale et révoque le renouvellement ; un jeton d’accès déjà émis peut rester valide jusqu’à son expiration.

## Tests et limites actuelles

```powershell
npm test
npm run check
```

Les tests automatisés couvrent l’authentification, les profils et les parties avec un dépôt simulé. Pour tester le vrai Supabase configuré (création de deux comptes temporaires et nettoyage) :

```powershell
npm run build
$env:RUN_SUPABASE_SMOKE='1'
node --env-file-if-exists=.env scripts/smoke-games.mjs
```

## Parties entre téléphones

| Route | Usage |
|---|---|
| `GET /api/games` | Liste des parties du compte connecté, sans lettres |
| `POST /api/games` | Invitation `{id,opponentId}`, UUID générés côté client |
| `GET /api/games/:id` | État du plateau, chevalet personnel et nombres de lettres adverses |
| `POST /api/games/:id/actions` | `{id,revision,kind,...}` : `accept`, `decline`, `play`, `exchange`, `pass` |

`play` reçoit `placements:[{cell,rackIndex,letter}]` ; `exchange` reçoit `indices:[number]`. Aucun score, tirage ou état proposé par le client n’est accepté. L’API valide l’appartenance et le tour, applique les règles, puis remplace atomiquement la ligne si la révision correspond toujours. Un conflit retourne 409 et nécessite la récupération du nouvel état. La répétition de la dernière action avec le même identifiant renvoie le résultat déjà enregistré.

La table `games` a RLS et aucun accès pour `anon`/`authenticated`. Seul le serveur peut lire les chevalets et le sac complets. Les invitations entre une même paire sont uniques tant qu’elles attendent une réponse.

`npm start`, `npm run dev` et `npm test` compilent automatiquement le moteur TypeScript de `mobile/src/engine.ts` via esbuild dans `api/dist/engine.mjs`. Les règles ne sont pas recopiées dans l’API. Un déploiement doit inclure le dépôt complet (moteur, données du lexique et licences). Installer les dépendances de compilation avant `npm run build`, puis démarrer le serveur ; `npm ci --omit=dev` seul ne suffit pas à compiler.

L’app actualise les parties ouvertes toutes les 5 secondes et l’accueil toutes les 10 secondes au premier plan. Notifications push et hébergement distant ne font pas partie de cette étape.
