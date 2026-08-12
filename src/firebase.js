import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// 1. Ve a https://console.firebase.google.com → crea un proyecto (gratis)
// 2. En el proyecto: Configuración del proyecto (icono de engranaje) → "Tus apps" → agrega una app web (</>)
// 3. Copia el objeto de configuración que te muestra y reemplaza los valores de abajo
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB7sodBGjgxIEkeRKu-OzQeSvpMHh0Iu3k",
  authDomain: "finanzas-b6264.firebaseapp.com",
  projectId: "finanzas-b6264",
  storageBucket: "finanzas-b6264.firebasestorage.app",
  messagingSenderId: "201783265623",
  appId: "1:201783265623:web:132ee7b504a23e9daed612",
  measurementId: "G-WF96P73SEP"
};
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
