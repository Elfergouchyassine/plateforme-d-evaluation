import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sert les fichiers statiques du dossier 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Envoie l'utilisateur vers index.html par défaut
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`FRONTEND AUTH actif sur : http://localhost:${PORT}`);
});