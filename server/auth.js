import fs from "fs";

const USERS_FILE = "./users.json";

// S'assurer que le fichier existe au démarrage
if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

// --- FONCTION INSCRIPTION ---
export const registerUser = (email, password, role = "student") => {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));

    // Vérifier si l'utilisateur existe déjà
    if (users.find(u => u.email === email)) {
        return { error: "Cet email est déjà utilisé." };
    }

    // Création du nouvel utilisateur (Par défaut 'student' si non précisé)
    const newUser = { email, password, role };
    users.push(newUser);

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    return { success: true, user: newUser };
};

// --- FONCTION CONNEXION (C'est ici que le rôle est récupéré) ---
export const loginUser = (email, password) => {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));

    // On cherche l'utilisateur qui correspond EXACTEMENT à l'email ET au mot de passe
    const user = users.find(u => u.email === email && u.password === password);

    if (!user) {
        return { error: "Email ou mot de passe incorrect." };
    }

    // On renvoie l'objet utilisateur complet (incluant le rôle : 'teacher' ou 'student')
    return { 
        success: true, 
        user: {
            email: user.email,
            role: user.role 
        } 
    };
};
