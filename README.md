# WebOS Radio

## Entwicklung

```bash
npm install
npm run dev
```

Vite stellt App und Audio-Proxy gemeinsam unter Port `5173` bereit.

## App und Proxy gemeinsam starten

Ein Befehl baut die App und startet anschließend App und Proxy gemeinsam:

```bash
npm start
```

Danach ist alles unter `http://localhost:8787` beziehungsweise der LAN-IP auf
Port `8787` erreichbar. Es werden keine zwei Prozesse benötigt.

Oder als Container:

```bash
docker build -t webos-radio .
docker run -p 8787:8787 webos-radio
```

Für öffentliche Deployments sollten `PROXY_ALLOW_ORIGIN` und
`ALLOWED_MEDIA_HOSTS` gesetzt werden. Letzteres ist eine kommagetrennte Liste
erlaubter Domains. Private und lokale Zieladressen werden grundsätzlich
blockiert.

## Statische webOS-Installation

Die installierte statische App benötigt die öffentliche URL des Proxys:

```bash
VITE_MEDIA_PROXY_URL=https://proxy.example.com/media-proxy \
VITE_METADATA_PROXY_URL=https://proxy.example.com/media-metadata \
npm run build
```

Der Inhalt von `dist/` kann anschließend als webOS-App verpackt werden.

Wenn der Fernseher stattdessen die App über `http://SERVER-IP:8787` öffnet,
werden App und Proxy automatisch über dieselbe Adresse verwendet und die
Umgebungsvariablen sind nicht erforderlich.
