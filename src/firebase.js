import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// 1. Ve a https://console.firebase.google.com → crea un proyecto (gratis)
// 2. En el proyecto: Configuración del proyecto (icono de engranaje) → "Tus apps" → agrega una app web (</>)
// 3. Copia el objeto de configuración que te muestra y reemplaza los valores de abajo
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
