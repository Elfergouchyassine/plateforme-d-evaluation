# Plateforme PDRP — Projet Fusionné

## Services Docker

| Container       | Port | Description                          |
|-----------------|------|--------------------------------------|
| auth-frontend   | 3000 | Page de connexion (HTML statique)    |
| frontend        | 5173 | Interface React (éditeur de code)    |
| backend         | 5000 | API Express (auth + exercices + Sonar) |
| sonarqube       | 9000 | Analyse qualité de code              |
| sonar_db        | —    | PostgreSQL pour SonarQube            |
| mongodb         | 27017| Base de données des exercices        |

## Démarrage avec Docker

### Étape 1 — Démarrer SonarQube d'abord (pour récupérer le token)

```bash
docker-compose up sonar_db sonarqube -d
```

Attendre ~2 minutes puis aller sur http://localhost:9000
- Login : `admin` / `admin`
- Changer le mot de passe si demandé
- Aller dans **My Account → Security → Generate Token**
- Copier le token

### Étape 2 — Créer le fichier .env

```bash
cp .env.example .env
# Éditer .env et remplacer "your_sonarqube_token_here" par votre vrai token
```

### Étape 3 — Tout démarrer

```bash
docker-compose up --build
```

### Accès
- **Login** → http://localhost:3000
- **Application** → http://localhost:5173
- **SonarQube** → http://localhost:9000

## Comptes de test

| Email           | Mot de passe | Rôle     |
|-----------------|-------------|----------|
| prof@pdrp.fr    | 123         | teacher  |
| eleve@pdrp.fr   | 123         | student  |
| prof@test.com   | 1234        | teacher  |

## Structure du projet

```
merged-project/
├── docker-compose.yml       ← Lance tout
├── .env.example             ← Copier en .env et remplir le token
├── server/
│   ├── Dockerfile           ← Node + Java + sonar-scanner
│   ├── server.js            ← Auth + Exercices + SonarQube API
│   ├── auth.js              ← Login/Register
│   └── users.json           ← Utilisateurs
├── frontend/
│   ├── Dockerfile           ← Build React + serve
│   └── src/App.jsx          ← Vue étudiant + vue professeur
├── auth-frontend/
│   ├── Dockerfile           ← Page de login
│   └── public/index.html
```

## Flux utilisateur

1. Aller sur **http://localhost:3000** (page de login)
2. Se connecter → redirigé vers **http://localhost:5173?role=teacher** ou `?role=student`
3. **Étudiant** : sélectionne un exercice, code dans l'éditeur, exécute (Judge0), analyse (SonarQube)
4. **Professeur** : crée / modifie / supprime des exercices avec code de classe
