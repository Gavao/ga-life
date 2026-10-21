# GA Life

Una piccola "The Sims" per due, in una casetta isometrica: create la coppia, prendetevi cura dei bisogni
(fame, energia, igiene, vescica, svago, socialità), trovate un lavoro, fate carriera e arredate casa.

- **Dati solo sul telefono** (IndexedDB): la partita si salva da sola; quando l'app è chiusa il tempo si ferma.
- **Android**: APK "guscio" (cartella `android/`) che apre l'app pubblicata su GitHub Pages e si aggiorna da solo.
- **iPhone**: aprire https://gavao.github.io/ga-life/ in Safari → Condividi → Aggiungi alla schermata Home.

## Comandi
- Prova in locale: `powershell -ExecutionPolicy Bypass -File serve.ps1` → http://localhost:8101
- Pubblica: `powershell -ExecutionPolicy Bypass -File tools\publish.ps1 "Descrizione"`
- APK: `powershell -ExecutionPolicy Bypass -File android\build.ps1` (con `-Release` lo pubblica su GitHub)
