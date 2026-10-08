# Bot de WhatsApp — arquitectura y puesta en marcha

Registra gastos escribiendo por WhatsApp: `50000 comida almuerzo`, `120000 transporte gasolina`,
`200000 deuda pago tarjeta`, `ingreso 1500000 freelance`, `35000 comida cena con davivienda` (consumo a crédito).
El bot responde con el **ID** del movimiento y **lo que te queda del mes**.
Comandos extra: `saldo`, `deshacer`, `ayuda`, `vincular 123456`.

## Arquitectura

```
WhatsApp ──► Meta Cloud API ──POST──► Cloud Function whatsappWebhook ──► Firestore profiles/{uid}
   ▲                                      │  1. verifica firma HMAC (App Secret)
   └────────── respuesta (Graph API) ◄────┘  2. phoneLinks/{teléfono} → uid
                                              3. parseMessage() → comando
                                              4. transacción: registra + ajusta deudas + idempotencia
```

| Pieza | Archivo |
|---|---|
| Webhook HTTP (GET verificación, POST mensajes) | `functions/index.js` |
| Firma HMAC y extracción de mensajes | `functions/signature.js` |
| Lógica del bot (testeable, sin HTTP) | `functions/processor.js` |
| Parser de lenguaje natural | `src/lib/messageParser.js` |
| Balance mensual / deudas (compartidos con la app) | `src/lib/monthly.js`, `src/lib/debts.js` |
| Vincular número desde la app | `src/components/WhatsAppLink.jsx` |
| Seguridad | `firestore.rules` |

`scripts/sync-functions-lib.mjs` copia los módulos de `src/lib` a `functions/lib` antes de cada despliegue: la app y el bot usan **la misma lógica**.

### Colecciones nuevas
- `linkCodes/{código}` → `{uid, expiresAt}` la crea la app (usuario autenticado), vigente 10 min, un solo uso.
- `phoneLinks/{teléfono}` → `{uid}` la crea **solo la función** (Admin SDK). El usuario puede leerla y borrarla (desvincular).
- `waMessages/{wamid}` → idempotencia: Meta reintenta entregas, nunca se registra dos veces.
- `waThrottle/{teléfono}` → máx. 5 códigos erróneos por 15 min.

### Seguridad ("sesión" por número de teléfono)
1. Meta certifica el número remitente; nadie puede suplantarlo sin controlar la SIM/cuenta de WhatsApp.
2. Cada POST se valida con `X-Hub-Signature-256` (HMAC-SHA256 con el App Secret): solo Meta puede llamar al webhook.
3. Vincular exige un código que solo ve el usuario autenticado en la app. Las reglas de Firestore impiden crear `phoneLinks` desde el cliente.
4. Las reglas siguen limitando `profiles/{uid}` al propio usuario.

## Puesta en marcha

### 1. App de Meta
1. https://developers.facebook.com → *Crear app* → tipo **Business** → añade el producto **WhatsApp**.
2. En *WhatsApp → Configuración de la API* copia el **ID del número de teléfono** (no es el número) y usa el número de prueba o registra el tuyo.
3. *Configuración de la app → Básica*: copia el **App Secret**.
4. Crea un **usuario del sistema** (Business Settings → Usuarios → Usuarios del sistema), asígnale la app y genera un **token permanente** con permiso `whatsapp_business_messaging`. (El token temporal de 24 h sirve para probar.)

### 2. Firebase (requiere plan **Blaze**; el uso personal cae en la capa gratuita)
```bash
npm i -g firebase-tools
firebase login
cd functions && npm install && cd ..
firebase functions:secrets:set WHATSAPP_VERIFY_TOKEN   # inventa una cadena larga
firebase functions:secrets:set WHATSAPP_APP_SECRET     # App Secret de Meta
firebase functions:secrets:set WHATSAPP_TOKEN          # token permanente
firebase deploy --only firestore:rules,functions       # pedirá WHATSAPP_PHONE_NUMBER_ID
```
> Si ya tenías reglas propias en la consola, `firestore.rules` las reemplaza: incluye la regla de `profiles` original.

El deploy imprime la URL: `https://us-central1-finanzas-b6264.cloudfunctions.net/whatsappWebhook`.

### 3. Registrar el webhook en Meta
*WhatsApp → Configuración → Webhook* → **URL de devolución de llamada** = la URL de arriba, **Token de verificación** = el de `WHATSAPP_VERIFY_TOKEN` → *Verificar y guardar* → suscríbete al campo **messages**.

### 4. Botón "Abrir WhatsApp" (opcional)
En GitHub: *Settings → Secrets and variables → Actions → Variables* → `WHATSAPP_BOT_NUMBER` = número del bot, solo dígitos (ej. `573001234567`).

### 5. Probar
App → **Datos → Registrar por WhatsApp → Generar código** → envía `vincular 123456` al bot → luego `50000 comida almuerzo`.

> Con el número de prueba de Meta solo puedes escribir desde números que añadas como destinatarios permitidos. Para uso real, registra tu propio número en WhatsApp Business.

## Twilio en lugar de Meta
Solo cambia el borde HTTP (`index.js`): Twilio envía `application/x-www-form-urlencoded` con `From`/`Body`/`MessageSid` y se valida con `X-Twilio-Signature`; la respuesta va como TwiML. `processIncoming()` y todo lo demás se reutilizan tal cual.

## Pruebas
```bash
node --test functions/test/processor.test.mjs   # tras `node scripts/sync-functions-lib.mjs`
```
