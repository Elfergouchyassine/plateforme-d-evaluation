# Plateforme d'Évaluation de Code

Plateforme web de type HackerRank/LeetCode permettant aux **professeurs** de créer des exercices de programmation avec tests unitaires, et aux **étudiants** de coder, tester et soumettre leurs solutions pour obtenir une note automatique sur 20.

---

## Table des matières

1. [Architecture](#architecture)
2. [Prérequis](#prérequis)
3. [Installation](#installation)
4. [Configuration SonarQube](#configuration-sonarqube)
5. [Démarrage complet](#démarrage-complet)
6. [Comptes de test](#comptes-de-test)
7. [Utilisation](#utilisation)
8. [Système de notation](#système-de-notation)
9. [Structure du projet](#structure-du-projet)
10. [Dépannage](#dépannage)

---

## Architecture

L'application est composée de **7 conteneurs Docker** orchestrés avec Docker Compose et communiquant sur un réseau interne `app-network`.

| Conteneur      | Technologie                        | Port   | Rôle                                              |
|----------------|------------------------------------|--------|---------------------------------------------------|
| `auth-frontend`| HTML · CSS · JavaScript            | 3000   | Page de connexion, génération JWT, redirection    |
| `frontend`     | React 18 · Vite · CodeMirror       | 5173   | Interface étudiant et interface professeur        |
| `backend`      | Node.js · Express · Mongoose       | 5000   | API REST centrale — orchestration de tous les services |
| `code-runner`  | Node.js 20 · Python 3 · Jest · pytest | 4000 | Exécution du code et tests unitaires en sandbox   |
| `mongodb`      | MongoDB 6                          | 27017  | Stockage exercices et soumissions                 |
| `sonarqube`    | SonarQube LTS Community            | 9000   | Analyse statique de la qualité du code            |
| `sonar_db`     | PostgreSQL 13                      | interne| Base de données interne de SonarQube              |

### Flux de données

```
Étudiant / Professeur
        │
        ▼
  Auth Frontend :3000  ──(JWT + rôle + email)──▶  Frontend React :5173
                                                          │
                                                          ▼
                                                   Backend API :5000
                                                   ┌──────┼──────────┐
                                                   ▼      ▼          ▼
                                             Code Runner MongoDB  SonarQube
                                               :4000    :27017     :9000
                                               Jest      │       Rating A→E
                                               pytest    │          │
                                                 │       └────┬─────┘
                                                 └─────▶ Note /20 stockée
```

---

## Prérequis

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (version 24+)
- Docker Compose (inclus avec Docker Desktop)
- 4 Go de RAM disponibles minimum (SonarQube est gourmand)
- Ports libres : **3000, 4000, 5000, 5173, 9000, 27017**

> **Windows** : s'assurer que WSL 2 est activé et que Docker utilise le backend WSL 2.

---

## Installation

### 1. Cloner le dépôt

```bash
git clone <url-du-repo>
cd merged-project
```

### 2. Créer le fichier `.env`

Le fichier `.env` à la racine du projet contient les variables d'environnement sensibles.

```bash
# Créer le fichier .env (à partir de l'exemple si disponible)
cp .env.example .env
```

Contenu attendu du `.env` :

```env
SONARQUBE_TOKEN=<votre_token_sonarqube>
MONGO_URI=mongodb://mongodb:27017/pdrp_database
```

> Le token SonarQube doit être généré manuellement — voir la section suivante.

---

## Configuration SonarQube

SonarQube nécessite un **token d'authentification** pour que le backend puisse soumettre des analyses. Cette étape doit être faite **une seule fois** au premier lancement.

### Étape 1 — Démarrer uniquement SonarQube

```bash
docker-compose up sonar_db sonarqube -d
```

Attendre **2 à 3 minutes** que SonarQube soit complètement initialisé.

> Pour vérifier que SonarQube est prêt :
> ```bash
> docker logs sonarqube --tail 20
> ```
> Attendre le message : `SonarQube is operational`

### Étape 2 — Se connecter à SonarQube

Ouvrir [http://localhost:9000](http://localhost:9000) dans le navigateur.

- **Login** : `admin`
- **Mot de passe** : `admin`

SonarQube demande de changer le mot de passe à la première connexion. Définir un nouveau mot de passe et le noter.

### Étape 3 — Générer un token d'authentification

1. Cliquer sur l'avatar en haut à droite → **My Account**
2. Aller dans l'onglet **Security**
3. Dans la section **Generate Tokens** :
   - **Name** : `pdrp-token` (ou un nom au choix)
   - **Type** : `Global Analysis Token`
   - **Expires in** : `No expiration`
4. Cliquer sur **Generate**
5. **Copier immédiatement le token** — il ne sera plus affiché après fermeture

Le token ressemble à : `squ_a1b2c3d4e5f6...`

### Étape 4 — Ajouter le token dans `.env`

Éditer le fichier `.env` à la racine du projet :

```env
SONARQUBE_TOKEN=squ_a1b2c3d4e5f6...
MONGO_URI=mongodb://mongodb:27017/pdrp_database
```

> **Important** : Ne jamais committer le fichier `.env` dans Git. Il est listé dans `.gitignore`.

### Étape 5 — Vérifier que SonarQube est bien configuré

Lors du démarrage du backend, le log affichera :

```
✅ SonarQube configured: http://sonarqube:9000
```

Si le token est absent ou invalide :

```
⚠️  SONARQUBE_TOKEN not set — SonarQube analysis disabled
```

---

## Démarrage complet

Une fois le token configuré dans `.env`, lancer tous les services :

```bash
docker-compose up --build
```

> Le flag `--build` est nécessaire au premier lancement ou après modification du code.
> Les lancements suivants (sans modification) : `docker-compose up`

### Temps de démarrage approximatifs

| Service       | Temps estimé |
|---------------|--------------|
| MongoDB       | ~10 secondes |
| Code Runner   | ~15 secondes |
| Backend       | ~20 secondes |
| Frontend      | ~30 secondes |
| SonarQube     | ~2-3 minutes |

### URLs d'accès

| Interface            | URL                          |
|----------------------|------------------------------|
| Page de connexion    | http://localhost:3000        |
| Application          | http://localhost:5173        |
| Interface SonarQube  | http://localhost:9000        |

> Toujours commencer par **http://localhost:3000** — c'est le point d'entrée de l'application.

---

## Comptes de test

| Email         | Mot de passe | Rôle       |
|---------------|-------------|------------|
| prof@pdrp.fr  | 123         | Professeur |
| eleve@pdrp.fr | 123         | Étudiant   |
| prof@test.com | 1234        | Professeur |

---

## Utilisation

### Interface Professeur

Après connexion avec un compte professeur :

1. **Créer un exercice** (formulaire à gauche) :
   - Titre et description de l'exercice
   - **Langage** : JavaScript ou Python
   - **Difficulté** : Facile / Moyen / Difficile
   - **Classe cible** : CP1 / CP2 / CI1 / CI2 / Toutes
   - **Tests unitaires** (optionnel) : code Jest (JS) ou pytest (Python)

2. **Format des tests unitaires** :

   Pour JavaScript (Jest) :
   ```js
   const { maFonction } = require('./solution');

   test('description du test', () => {
     expect(maFonction(2)).toBe(4);
   });
   ```

   Pour Python (pytest) :
   ```python
   from solution import ma_fonction

   def test_exemple():
       assert ma_fonction(2) == 4
   ```

3. **Gérer les exercices** : modifier (✏️) ou supprimer (🗑️) depuis la liste à droite

4. **Consulter les notes** : tableau des soumissions des étudiants visible en bas de page (note tests, note qualité, note finale, date)

5. **Aperçu étudiant** : bouton `👁️ Aperçu Étudiant` pour voir l'interface comme un étudiant

---

### Interface Étudiant

Après connexion avec un compte étudiant :

1. **Rechercher et filtrer les exercices** :
   - Barre de recherche par titre
   - Filtre par Langage (JavaScript / Python)
   - Filtre par Classe (CP1 / CP2 / CI1 / CI2)
   - Filtre par Difficulté (Facile / Moyen / Difficile)

2. **Sélectionner un exercice** : cliquer sur une carte dans le panneau de gauche

3. **Écrire le code** dans l'éditeur CodeMirror (coloration syntaxique, numéros de ligne)

4. **Trois actions disponibles** :

   | Bouton | Action | Description |
   |--------|--------|-------------|
   | `▶ Exécuter` | Exécution rapide | Lance le code et affiche la sortie console |
   | `🧪 Tester` | Tests unitaires | Lance les tests définis par le prof (Jest/pytest) |
   | `📤 Soumettre` | Soumission complète | Exécution + Tests + Analyse SonarQube → Note /20 |

5. **Résultats de la soumission** :
   - **Note finale** /20 avec code couleur (vert ≥ 16, orange ≥ 12, rouge < 12)
   - **Tests** : liste des tests passés/échoués avec messages d'erreur
   - **Rapport qualité SonarQube** : issues détectées dans le code (bugs, code smells, vulnérabilités)
   - **Contenu pédagogique** : explications sur les problèmes détectés

---

## Système de notation

La note finale est calculée automatiquement lors de la soumission :

```
Note Finale /20 = Note Tests /10 + Note Qualité SonarQube /10
```

### Note des tests (`/10`)

Basée sur le ratio de tests passés :

```
Note Tests = (tests passés / tests totaux) × 10
```

### Note de qualité SonarQube (`/10`)

Basée sur le `sqale_rating` retourné par SonarQube :

| Rating SonarQube | Signification       | Note /10 |
|-----------------|---------------------|----------|
| A               | Excellente qualité  | 10       |
| B               | Bonne qualité       | 8        |
| C               | Qualité moyenne     | 6        |
| D               | Qualité insuffisante| 4        |
| E               | Mauvaise qualité    | 2        |

### Cas particulier : pas de tests définis

Si le professeur n'a pas défini de tests pour l'exercice :

```
Note Finale /20 = Note Qualité SonarQube × 2
```

### Isolation des projets SonarQube

Chaque étudiant possède un projet SonarQube unique par exercice :

```
Clé projet : proj-{email_slug}-{exerciseId}-{language}
Exemple    : proj-etudiant_email_com-64f3a1b2c3d4e5-javascript
```

Cela garantit que les rapports ne se mélangent pas entre étudiants ou entre exercices.

---

## Structure du projet

```
merged-project/
├── docker-compose.yml          ← Orchestration de tous les services
├── .env                        ← Variables d'environnement (ne pas committer)
├── .env.example                ← Exemple de configuration
│
├── auth-frontend/              ← Page de connexion (HTML statique)
│   ├── Dockerfile
│   └── public/
│       └── index.html          ← Formulaire login/register + génération JWT
│
├── frontend/                   ← Interface React
│   ├── Dockerfile
│   └── src/
│       ├── App.jsx             ← Vue étudiant + vue professeur + composants
│       ├── App.css             ← Styles globaux
│       ├── index.css           ← Layout principal (flex, scroll, header)
│       └── utils/
│           └── education.js    ← Parsing rapports SonarQube → contenu pédagogique
│
├── server/                     ← API Backend
│   ├── Dockerfile              ← Node.js + Java + sonar-scanner CLI
│   ├── server.js               ← Routes REST, modèles Mongoose, logique Sonar
│   ├── auth.js                 ← Login / Register avec users.json
│   ├── users.json              ← Base d'utilisateurs (email, password, role)
│   └── temp_code/              ← Répertoire temporaire pour sonar-scanner
│
└── code-runner/                ← Microservice d'exécution de code
    ├── Dockerfile              ← Node.js 20 Alpine + Python 3 + Jest + pytest
    ├── index.js                ← Express server — /execute et /test
    └── package.json            ← Dépendances (express, jest)
```

---

## Dépannage

### SonarQube ne démarre pas

```bash
# Vérifier les logs
docker logs sonarqube

# Problème fréquent sous Linux : vm.max_map_count trop bas
sudo sysctl -w vm.max_map_count=262144
```

### Le token SonarQube est invalide

1. Aller sur [http://localhost:9000](http://localhost:9000) → **My Account** → **Security**
2. Révoquer l'ancien token et en générer un nouveau
3. Mettre à jour `.env` avec le nouveau token
4. Redémarrer le backend :
   ```bash
   docker-compose restart backend
   ```

### La note Sonar est toujours 2/10 (rating E)

Le backend affiche dans les logs le projectKey utilisé. Vérifier que SonarQube a bien reçu et analysé le projet :

```bash
docker logs backend --tail 50
```

### Le Code Runner ne répond pas

```bash
docker logs code-runner
docker-compose restart code-runner
```

### Reconstruire entièrement l'application

```bash
docker-compose down
docker-compose up --build
```

### Supprimer toutes les données (reset complet)

```bash
docker-compose down -v   # ⚠️ supprime tous les volumes (MongoDB + SonarQube)
docker-compose up --build
```

> Après un reset complet, refaire la configuration du token SonarQube depuis l'[Étape 2](#étape-2--se-connecter-à-sonarqube).
