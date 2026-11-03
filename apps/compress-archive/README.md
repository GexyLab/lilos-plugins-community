# Compress Archive

Crea ed estrae archivi: **zip, 7z, tar, tar.gz, tar.bz2, tar.xz, iso**, i file compressi singoli **gz, bz2 e xz**, e apre i **rar**. Prende il posto dell'app Zip.

## Cosa fa

- **Comprimi → Zip** e **Comprimi → Tar.gz**: dal menu del tasto destro di file e cartelle (sulla scrivania e nel File Manager) creano subito l'archivio nella stessa cartella. Un elemento dà il suo nome all'archivio (`Foto` → `Foto.zip`); più elementi selezionati diventano `Archivio.zip`.
- **Comprimi → Comprimi come…**: una finestra per scegliere il formato, il nome, la compressione (veloce, normale, massima) e, per lo zip, una password. Gz, bz2 e xz comprimono un file solo, così com'è (`note.txt` → `note.txt.gz`). Le scelte vengono ricordate.
- **Comprimi → Estrai qui**: sugli archivi li estrae nella stessa cartella. Un archivio con una sola cartella dà quella cartella; altrimenti una cartella nuova con il nome dell'archivio raccoglie tutto. Un file compresso singolo torna il file che era.
- **Apri un archivio** con il doppio clic: la finestra mostra il formato e il contenuto ad albero, con ricerca, e permette di estrarre tutto o solo gli elementi scelti.

Compress Archive non sovrascrive mai niente: un nome già usato prende un numero (`Foto 2.zip`). A lavoro finito compare una notifica.

## Formati

| Formato | Crea | Estrae |
|---|---|---|
| zip (anche con password AES-256) | sì | sì |
| 7z | sì | sì |
| tar, tar.gz / tgz, tar.bz2, tar.xz | sì | sì |
| iso (ISO 9660 con Joliet e Rock Ridge) | sì | sì |
| gz, bz2, xz (un file) | sì | sì |
| rar (RAR 4 e RAR 5) | no | sì |

Gli archivi RAR non si possono creare: il formato è proprietario. Le compressioni zstd, lz4, lzip e .Z vengono riconosciute e dichiarate non supportate.

## Da sapere

- Chiede di leggere e modificare i file della home (`fs.write:~`): deve leggere il contenuto delle cartelle e scrivere l'archivio accanto agli elementi.
- Archivi e file estratti arrivano a 10 MB ciascuno, come ogni file di lilOS; in tutto al massimo 256 MB e 10.000 file per volta.
- Le password servono solo per l'operazione in corso e non vengono mai salvate. Si possono aprire zip cifrati (AES e ZipCrypto); rar e 7z cifrati non sono supportati e la notifica lo dice.
- Restano fuori, e la notifica lo dice, i collegamenti, i dispositivi, i percorsi pericolosi (`..`) e i file oltre 10 MB. `__MACOSX`, `.DS_Store`, `Thumbs.db` e `desktop.ini` si saltano.
- Il motore è [libarchive](https://www.libarchive.org) 3.8.10 con zlib, bzip2, xz e Mbed TLS, compilati in WebAssembly: gira nel processo in background dell'app e non rallenta lilOS.

Vuole lilOS 1.22.0 o successivo.

## Automazioni

Con **Automata** (lilOS 1.15.0 o successivo) Compress Archive rende registrabili **Comprimi in un archivio** (con formato e compressione) ed **Estrai un archivio**, ognuno con il file che ha fatto. Le operazioni con una password non vengono registrate.

## Da Zip a Compress Archive

L'app Zip non è più nel catalogo. Chi l'aveva può disinstallarla dall'AppStore dopo aver installato Compress Archive: fa tutto quello che faceva Zip. Le automazioni registrate con Zip vanno registrate di nuovo.
