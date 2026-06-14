# WebOS Radio

## Projektstruktur

- `src/App.tsx`: Anwendungszustand, Player-Abläufe und TV-Navigation
- `src/components/`: wiederverwendbare React-Komponenten
- `src/services/`: Zugriffe auf Radio- und Podcast-Verzeichnisse
- `src/lib/`: zustandslose Medien- und Speicher-Hilfsfunktionen
- `src/data/`: statische Standarddaten
- `server/`: statischer Webserver und abgesicherter Medien-Proxy
- `src/types.ts`: gemeinsam verwendete Datenmodelle

## Entwicklung

```bash
npm install
npm run dev
```

Vite stellt App und Audio-Proxy gemeinsam unter Port `5173` bereit.

## Auf einem LG webOS TV installieren

Docker wird nicht benötigt. Auf dem Fernseher wird nur das statische
webOS-Paket installiert.

Voraussetzungen:

1. Auf dem Fernseher die LG-App **Developer Mode** installieren und aktivieren.
2. Fernseher und Entwicklungsrechner müssen sich im selben Netzwerk befinden.
3. Den Fernseher einmal mit den webOS-CLI-Tools einrichten:

```bash
ares-setup-device
```

Anschließend die App bauen und als IPK verpacken:

```bash
npm run package:webos
```

Das erzeugte Paket installieren, wobei `TV_NAME` dem Namen aus
`ares-setup-device` entspricht:

```bash
ares-install --device TV_NAME com.webradio.app_1.0.0_all.ipk
```

Zum Starten über die CLI:

```bash
ares-launch --device TV_NAME com.webradio.app
```

## Audio-Proxy

Der Ordner `server/` gehört nicht in das TV-Paket. Er bleibt im Projekt, weil
einige Radiostreams und Titel-Metadaten auf dem Fernseher nur zuverlässig über
einen HTTPS-Proxy funktionieren.

Für ein installiertes TV-Paket die öffentliche HTTPS-Adresse des Proxys beim
Build angeben:

```bash
VITE_MEDIA_PROXY_URL=https://proxy.example.com/media-proxy \
VITE_METADATA_PROXY_URL=https://proxy.example.com/media-metadata \
npm run package:webos
```

Ohne diese Variablen versucht die App, HTTPS-Streams direkt abzuspielen. Das
kann funktionieren, Metadaten und manche Sender können dann aber ausfallen.

Den Proxy lokal ohne Docker starten:

```bash
npm start
```

Für einen öffentlich erreichbaren Proxy sollten `PROXY_ALLOW_ORIGIN` und
`ALLOWED_MEDIA_HOSTS` gesetzt werden. Private und lokale Zieladressen blockiert
der Server grundsätzlich.

## GitHub Pages

Der Workflow `.github/workflows/pages.yml` baut die App bei Pull Requests und
veröffentlicht jeden Push auf `main` automatisch über GitHub Pages.

Einmalig im Repository unter **Settings > Pages > Build and deployment** als
Quelle **GitHub Actions** auswählen. Die veröffentlichte App ist anschließend
unter `https://yunzerdogan.github.io/WebOSRadio/` erreichbar.

GitHub Pages kann den Node-Proxy aus `server/` nicht ausführen. Ohne weitere
Konfiguration greift der Pages-Build deshalb direkt auf HTTPS-Streams zu. Für
zuverlässigere Wiedergabe und Metadaten können unter **Settings > Secrets and
variables > Actions > Variables** diese Repository-Variablen gesetzt werden:

- `MEDIA_PROXY_URL`, zum Beispiel `https://proxy.example.com/media-proxy`
- `METADATA_PROXY_URL`, zum Beispiel `https://proxy.example.com/media-metadata`
