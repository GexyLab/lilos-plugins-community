# ArduinoIDE4LilOS

Scrive i programmi (gli *sketch*) per le schede **Arduino Uno, Nano e Mega**, li controlla e li carica sulla scheda. Gli sketch stanno in `~/Arduino`: sono file normali di lilOS, uno sketch per cartella.

All'installazione chiede di poter modificare i file della cartella **Arduino** della tua home, di usare le porte seriali del tuo computer e di usare il modulo **arduino** del kernel.

Sorgenti: [GexyLab/lilos-plugins-community](https://github.com/GexyLab/lilos-plugins-community), cartella `src/arduino-ide`.

## Cosa serve

- **lilOS dalla 1.18.0.**
- **Il browser.** Per caricare gli sketch e usare il monitor seriale servono **Chrome**, **Edge** o **Firefox 151 o più recente**, con lilOS aperto su un indirizzo `https` (o su `localhost`). **Safari non va.** Senza, puoi comunque scrivere e verificare gli sketch.
- **Il modulo del kernel.** ArduinoIDE4LilOS compila con il modulo **arduino**, nello stesso repository. Da lilOS 1.21.0 l'AppStore lo installa insieme all'app (dopo averlo detto) e chiede di riavviare il kernel, perché il modulo entra in funzione solo dopo il riavvio. Con un lilOS più vecchio, se manca, l'app lo dice («Manca il modulo Arduino del kernel»): un amministratore lo installa da AppStore → Kernel e riavvia lilOS.
- **La scheda collegata al computer in cui usi il browser**, anche se lilOS gira su un altro computer o su un server.

## La prima volta

La prima volta che si apre, ArduinoIDE4LilOS chiede di **preparare Arduino**. lilOS scarica gli strumenti per compilare e il pacchetto delle schede, circa 150 MB.

- Si fa una volta sola, per tutti gli utenti di questo lilOS.
- **Solo un amministratore può farlo.** Un altro utente vede «Solo un amministratore può preparare Arduino» e deve chiedere a un amministratore di aprire ArduinoIDE4LilOS una volta.

Premi **Prepara** e aspetta che i passi finiscano.

## Scrivere uno sketch

- La barra laterale ha tre schede:
  - **Sketchbook**: i tuoi sketch, con **Nuovo sketch**;
  - **Esempi**: aprono una copia nel tuo sketchbook;
  - **Gestore librerie**.
- Mentre scrivi compaiono i **suggerimenti** del codice. Gli errori si segnano nel testo e nel pannello **Problemi**.
- Uno sketch può avere più file (`.ino`, `.h`, `.hpp`, `.c`, `.cpp`): usa il pulsante per un nuovo file nello sketch.
- Le modifiche si salvano da sole; **Ctrl S** salva subito.

## Scegliere la scheda e la porta

1. Apri **Scheda e porta**.
2. Scegli la **scheda** (Uno, Nano, Mega) e, dove serve, il **processore**. Per i Nano e i cloni con il vecchio bootloader scegli «ATmega328P, vecchio bootloader».
3. Collega la scheda e scegli **Aggiungi una porta…**.
4. Indica la scheda nell'elenco che mostra il browser.

Il browser lo chiede una volta per porta; poi la porta compare nell'elenco da sola.

## Verificare e caricare

- **Verifica** (**Ctrl R**) compila lo sketch senza caricarlo. Il pannello **Output** dice quanto spazio usa il programma e quanta memoria usano le variabili, in byte e in percentuale.
- **Carica** (**Ctrl U**) compila e scrive il programma sulla scheda. Mostra l'avanzamento («Scrivo…», «Verifico…») e, a fine lavoro, una notifica. Non scollegare la scheda finché non finisce.
- Mentre carichi, il monitor seriale si ferma e poi riapre da solo la porta.

## Il monitor seriale

Il pannello **Monitor seriale** mostra ciò che la scheda scrive e le manda ciò che scrivi (premi Invio).

- **Apri** e **Chiudi** gestiscono la porta.
- Puoi scegliere:
  - la velocità in baud, che deve essere quella dello sketch;
  - il fine riga mandato;
  - se mostrare l'ora di ogni riga;
  - se scorrere da solo.
- **Pulisci** svuota il pannello.
- **Salva in un file** ne tiene una copia.

## Le librerie

Il **Gestore librerie** cerca, installa, aggiorna e rimuove le librerie di Arduino.

- Se una libreria ne usa altre, lilOS chiede se installare anche quelle: senza, lo sketch non compila.
- **Includi** aggiunge la riga `#include` allo sketch aperto.
- Le librerie che installi sono **tue**: gli altri utenti non le vedono.
- Le librerie fatte da te vanno nella cartella `~/Arduino/libraries`.
- Se uno sketch usa una libreria che non hai, il pannello **Problemi** propone **Installa e riprova**.

## Da sapere

- Il pacchetto delle schede è uno solo per tutti gli utenti; le librerie e gli sketch sono di ciascuno.
- Per ora le schede sono solo Arduino Uno, Nano e Mega (famiglia AVR).
- Il kernel non legge file del suo computer per conto dello sketch. Rifiuta quindi:
  - un `#include` con un percorso assoluto, con `..` o costruito da una macro;
  - l'assembler inline e la direttiva `.incbin`.
- Se la porta è già aperta da un altro programma (per esempio il monitor dell'IDE di Arduino) o da un'altra finestra, il browser non può aprirla: chiudi l'altro e riprova.
