# Introduzione

*emailconsumer* è la componente che si occupa di inviare le notifiche email agli utenti per conto di un determinato servizio in base alle preferenze impostate dall'utente.

# Getting Started

Per rendere operativo il sistema occorre:
1. impostare gli opportuni valori delle variabili d'ambiente
1. editare il file di configurazione
1. avviare l'applicazione

## Prerequisites

* Istanza attiva di Postgres
* Componente Preferences attiva per poter leggere le preferenze degli utenti
* Componente Message broker attiva per leggere i messaggi e tracciare eventi
* Componente Events attiva per inserire su db gli eventi generati (opzionale)

## Configuration
La configurazione è basata su variabili d'ambiente e file di configurazione. Una variabile può essere presente sia su variabile d'ambiente sia nel file di conf specifico dell'ambiente che nel file di conf generico della componente. All'avvio della comopnente viene effettuato il merge di questi tre entry point. Le variabili se prensenti in più punti (file o env) vengono gestite con la seguente priorità (dalla più alta alla più bassa):
* variabile d'ambiente
* file di conf specifico dell'ambiente
* file di conf generico della componente

Le variabili d'ambiente da valorizzare sono:
* `ENVIRONMENT`: rappresenta l'ambiente di esecuzione (ad esempio dev, tst o prod). Serve per individuare il file di configurazione secondario.

I file di configurazione sono `conf/emailconsumer.json` e`conf/emailconsumer-{ENVIRONMENT}.json`. Ove lo stesso parametro sia presente su entrambi i file il valore in `conf/emailconsumer-{ENVIRONMENT}.json` ha la precedenza.

I principali attributi presenti nei file di configurazione sono elencati di seguito (per l'elenco completo visualizzare il contenuto dei file presenti nella cartella src/conf):

* `app_name` : nome dell'applicazione (obbligatorio per tracciatura degli eventi e check sicurezza)
* `email_server`: contiene le configurazioni email
    * `host`: host del server smtp
    * `port`: porta del server smtp
* `authenticated_email_server`: contiene le configurazioni del server email autenticato
    * `host`: host del server smtp
    * `port`: porta del server smtp
* `mb`: contiene la configurazione per il Message Broker.
    * `queues`: contiene le informazioni per le code del message broker
        * `events`: url della coda su cui scrivere gli eventi
        * `retry`: url della coda di retry degli eventi non correttamente inseriti su db
        * `messages`: url della coda su cui leggere i messaggi da inviare
        * `keys`: url della coda da cui recuperare i template email
    * `token`: il token auth per chiamare il message broker
* `preferences`: contiene le configurazioni per chiamare il servizio delle preferenze
    * `url`: url del servizio delle preferenze
    * `token`: token per invocare il servizio delle preferenze
* `log4js`: la configurazione di log4js (vedi https://www.npmjs.com/package/log4js)
* `defaulttenant`: tenant di default

# Running

Avviare emailconsumer 
```
cd src && node emailconsumer.js
```

or

```
npm start
```

# Eventi
Il sistema registra su un message broker basato su api rest gli eventi relativi all'esecuzione. Vedi la componente [notify-events](https://github.com/csipiemonte/notify-events) per i dettagli sul formato degli eventi.

## Use case

Vedere file [docs/UseCase.md](https://github.com/csipiemonte/notify-messagebroker/blob/master/docs/UseCase.md) della componente **notify-messagebroker** per dettagli su come inviare una notifica push a un utente.