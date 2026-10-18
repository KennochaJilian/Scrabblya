# Hébergement de l’API Scrabblya

Architecture reprise d’Alexandrya : Azure Pipelines construit l’image et la pousse sur Docker Hub ; Portainer exécute la stack ; Apache expose l’API en HTTPS. Supabase conserve les comptes, les parties et les avatars. L’app Android ne se déploie pas dans Apache.

## 1. Docker Hub et Azure

Créer le dépôt Docker Hub `codinaaranxa/scrabblya-api`. Le pipeline `azure-pipelines.yml` cible la branche `main` et reprend :

- le pool existant `vps-alexandrya` ;
- la connexion Docker Hub `dockerhub-alexandrya` ;
- les tags `latest` et SHA complet du commit.

Dans Azure DevOps, créer le pipeline Scrabblya depuis ce fichier YAML et lui autoriser explicitement le pool et la service connection. S’ils se trouvent dans un autre projet Azure, les partager ou créer une connexion dédiée, puis adapter les variables du YAML. Ne renseigner aucune clé Supabase dans Azure : elle sera injectée au démarrage par Portainer.

Le pipeline vérifie l’API et l’app, construit l’image, puis la publie uniquement depuis `main`. Les PR ne sont pas exécutées automatiquement sur l’agent VPS. L’artefact `scrabblya-deployment` contient les fichiers de configuration du serveur.

Construction locale depuis la racine :

```bash
docker build -f api/Dockerfile -t scrabblya-api:local .
```

L’image contient le moteur compilé, le lexique, ses sources et licences, les dépendances de production et le serveur. Elle s’exécute avec l’utilisateur `node` sans recompilation au démarrage. Les fichiers `.env`, les ressources graphiques et les dépendances mobiles ne font pas partie du contexte de construction.

## 2. Stack Portainer

Créer une nouvelle stack nommée `scrabblya` avec `deploy/compose.portainer.yaml`. Renseigner les variables de `deploy/portainer.env.example` :

```dotenv
SCRABBLYA_API_IMAGE=codinaaranxa/scrabblya-api:latest
API_HOST_PORT=3001
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_PUBLISHABLE_KEY=la-cle-publique-du-projet
SUPABASE_SECRET_KEY=la-cle-secrete-du-projet
CORS_ORIGINS=https://scrabblya.aquarius.irish
```

Copier les trois valeurs Supabase depuis `api/.env` dans les variables Portainer, sans les mettre dans Git ni dans le compose. Si le dépôt Docker Hub est privé, connecter le registre dans Portainer.

Le port est publié seulement sur `127.0.0.1:3001`, derrière Apache. Le conteneur utilise un système de fichiers en lecture seule, un petit `/tmp` en mémoire et des logs limités. Aucun volume de données local n’est nécessaire. `TRUST_PROXY_HOPS=1` correspond au seul proxy Apache placé devant le port local. Adapter le port de la stack et celui du vhost ensemble si 3001 est déjà occupé sur le VPS.

Les migrations `001_profiles.sql` et `002_games.sql` doivent déjà être appliquées dans Supabase. Elles ne sont pas rejouées au démarrage ; l’admin existant est conservé.

Après lancement :

```bash
curl --fail http://127.0.0.1:3001/health
docker logs --tail 100 scrabblya-api
```

`/health` vérifie le serveur, pas la disponibilité de Supabase. Vérifier ensuite une connexion réelle depuis l’app. Le healthcheck Docker marque un conteneur malade ; il ne provoque pas à lui seul son redémarrage. La politique `unless-stopped` relance un processus qui s’arrête.

## 3. Domaine et Apache

Créer un enregistrement DNS A `scrabblya.aquarius.irish` vers le même VPS qu’Alexandrya. Si un AAAA existe, il doit aussi pointer vers un VPS joignable en IPv6.

Copier `deploy/apache/scrabblya.conf` dans `/etc/apache2/sites-available/scrabblya.conf`, puis sur le VPS :

```bash
sudo a2enmod proxy proxy_http headers ssl
sudo a2ensite scrabblya.conf
sudo apachectl configtest
sudo systemctl reload apache2
```

Une fois le DNS propagé, obtenir le certificat avec le Certbot déjà utilisé sur le VPS :

```bash
sudo certbot --apache -d scrabblya.aquarius.irish --redirect
sudo apachectl configtest
curl --fail https://scrabblya.aquarius.irish/health
```

Apache relaie `/api/` et `/health` au conteneur. Il efface l’en-tête IP transmis par le client avant d’ajouter l’IP réelle, pour que les limites de connexion de l’API utilisent la bonne adresse. La limite de requête Apache laisse passer les avatars de 2 Mo et leur enveloppe multipart.

## 4. Brancher l’app

Quand HTTPS fonctionne, remplacer dans `mobile/.env` :

```dotenv
EXPO_PUBLIC_API_URL=https://scrabblya.aquarius.irish/api
```

Puis relancer Expo avec `npx expo start --clear` et recharger l’app sur les deux téléphones. Aucun secret Supabase n’est embarqué. Tester une connexion, la liste des joueurs, un avatar et une partie. Les téléphones pourront alors joindre l’API en Wi-Fi ou en données mobiles, sans que le PC reste allumé.

L’URL locale est conservée dans le fichier de développement tant que l’hébergement n’est pas activé.

## Mises à jour et retour arrière

Un push sur `main` déclenche la construction et la publication. Comme pour Alexandrya, le push Docker Hub ne redémarre pas automatiquement Portainer : utiliser **Pull and redeploy** sur la stack Scrabblya.

Pour revenir à une version précédente, remplacer `SCRABBLYA_API_IMAGE` par `codinaaranxa/scrabblya-api:<SHA-du-commit>` puis redéployer. Garder la stack Alexandrya inchangée.
