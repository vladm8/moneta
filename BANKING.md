# Moneta — Enable Banking

Integracja AIS (tylko odczyt) korzysta z prawdziwego API Enable Banking. Nie ma w niej przycisków wykonujących płatności ani przelewy. Bez kluczy aplikacja pokazuje brak konfiguracji, a nie fikcyjne konta. Testy automatyczne korzystają wyłącznie z odpowiedzi syntetycznych.

## Szybka konfiguracja lokalna

Wymagany **Node.js 24.14 lub nowszy z modułem `node:sqlite`**. Obecny frontend nadal działa samodzielnie bez uruchamiania backendu.

1. W katalogu `D:\MONETA\moneta` wykonaj:

   ```powershell
   npm.cmd run banking:setup
   ```

   Polecenie tworzy `.env`, losowy klucz szyfrowania, bazę `.banking/moneta.sqlite` oraz konto dostępu do połączeń bankowych. Podaj login i własne hasło (minimum 12 znaków). Hasło nie jest wyświetlane. To **konto Moneta, nie hasło bankowe**. Kolejne uruchomienie pozwala dodać kolejnego użytkownika; nie nadpisuje istniejącego.

2. Zarejestruj aplikację **SANDBOX** w [Enable Banking Control Panel](https://enablebanking.com/cp/applications). Wybierz wygenerowanie klucza w przeglądarce i pobierz prywatny plik PEM albo zarejestruj własny certyfikat RSA. Prywatny klucz przechowuj poza katalogiem `public/` i `dist/`, najlepiej poza repozytorium.

3. W polu dozwolonych redirect/callback URLs wpisz dokładnie:

   **`http://localhost:5173/api/banking/callback`**

4. W `.env` uzupełnij:

   ```dotenv
   ENABLE_BANKING_ENVIRONMENT=SANDBOX
   ENABLE_BANKING_SANDBOX_APPLICATION_ID=identyfikator-z-panelu
   ENABLE_BANKING_SANDBOX_PRIVATE_KEY_PATH=C:/Users/TWOJ_USER/secure/enablebanking-sandbox.pem
   MONETA_ORIGIN=http://localhost:5173
   ```

   Zachowaj klucz `BANKING_ENCRYPTION_KEY` wygenerowany przez setup. Nie wysyłaj kluczy do GitHuba ani do czatu. Nie używaj prefiksu `VITE_` dla żadnego sekretu.

5. Uruchom w dwóch terminalach:

   ```powershell
   npm.cmd run banking:server
   ```

   ```powershell
   npm.cmd run dev -- --port 5173 --strictPort
   ```

6. Otwórz **http://localhost:5173** (nie `127.0.0.1`, ponieważ origin musi się zgadzać), wejdź do własnego profilu → **Połączone banki**, zaloguj się kontem z kroku 1. Pobierz instytucje, wybierz bank testowy i przejdź jego autoryzację. Dane testowego użytkownika uzyskaj z dokumentacji/panelu sandbox danej instytucji.

7. Po powrocie sprawdź stan synchronizacji. Wybierz nowe zaksięgowane transakcje i zatwierdź import jednym potwierdzeniem. Sprawdź też, czy saldo ma zastąpić istniejący ręczny składnik majątku, czy utworzyć nowy.

Sandbox i produkcję uruchamiaj w osobnych profilach przeglądarki, aby dane testowe nie mieszały się z Twoim prawdziwym budżetem. Lokalny profil jest powiązany z identyfikatorem użytkownika i środowiskiem; próba zmiany tego powiązania jest blokowana.

## Zmienne środowiskowe

| Zmienna                                      | Znaczenie                                                                                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONETA_ORIGIN`                              | Dokładny origin frontendu, bez końcowego `/`. Callback = origin + `/api/banking/callback`.                                                      |
| `BANKING_PORT`                               | Port backendu, domyślnie `3001`. Vite przekazuje `/api/banking` na ten domyślny port. Jeśli zmieniasz port, zmień też proxy w `vite.config.ts`. |
| `BANKING_DATABASE`                           | Ścieżka SQLite, domyślnie `.banking/moneta.sqlite`.                                                                                             |
| `BANKING_ENCRYPTION_KEY`                     | 32 losowe bajty w Base64, generowane przez setup. Wymagane do odczytu zaszyfrowanych połączeń.                                                  |
| `ENABLE_BANKING_ENVIRONMENT`                 | `SANDBOX` lub `PRODUCTION`.                                                                                                                     |
| `ENABLE_BANKING_SANDBOX_APPLICATION_ID`      | Application ID aplikacji sandbox.                                                                                                               |
| `ENABLE_BANKING_SANDBOX_PRIVATE_KEY_PATH`    | Ścieżka prywatnego klucza RSA sandbox.                                                                                                          |
| `ENABLE_BANKING_PRODUCTION_APPLICATION_ID`   | Osobny Application ID produkcyjny.                                                                                                              |
| `ENABLE_BANKING_PRODUCTION_PRIVATE_KEY_PATH` | Osobny prywatny klucz produkcyjny.                                                                                                              |
| `ENABLE_BANKING_ALLOW_PRODUCTION`            | Musi być `true`, żeby backend zezwolił na produkcję. Domyślnie `false`.                                                                         |

Plik `.env.example` zawiera wyłącznie placeholdery. `.env`, baza, WAL, klucze PEM/KEY są ignorowane przez Git. Vite blokuje ich serwowanie również podczas pracy lokalnej. Kopię bazy wykonuj przy zatrzymanym backendzie; bez właściwego klucza szyfrowania odtworzenie danych bankowych nie będzie możliwe.

## Restricted Production i telefon

1. Utwórz **osobną aplikację PRODUCTION** w panelu Enable Banking. Dokończ wymagane dane aplikacji i powiąż/udostępnij własne rachunki zgodnie z Restricted Production. Dostępność kont zależy od aktywacji aplikacji przez dostawcę.
2. Wystaw backend oraz zbudowany frontend pod **jedną domeną HTTPS**. Sam hosting statyczny nie wystarcza do tej integracji. Nie wystawiaj Vite jako serwera produkcyjnego.
3. Ustaw `MONETA_ORIGIN=https://twoja-domena.pl` i zarejestruj dokładnie **`https://twoja-domena.pl/api/banking/callback`**. Następnie ustaw produkcyjny Application ID, ścieżkę klucza, `ENABLE_BANKING_ENVIRONMENT=PRODUCTION` i `ENABLE_BANKING_ALLOW_PRODUCTION=true`.
4. Wykonaj `npm.cmd run build`, uruchom `npm.cmd run banking:server` i przekazuj HTTPS przez reverse proxy do `127.0.0.1:3001`. Backend obsługuje zarówno `dist/`, jak i `/api/banking`. Przykładowy minimalny Caddyfile:

   ```text
   twoja-domena.pl {
       reverse_proxy 127.0.0.1:3001
   }
   ```

5. Nie zapisuj query string callbacku, nagłówków Cookie/Authorization ani treści żądań w logach proxy. Backend sam ich nie loguje. Przechowuj klucze i bazę z uprawnieniami wyłącznie dla użytkownika uruchamiającego serwer.
6. Zaloguj się w sekcji bankowej i **jawnie zaznacz zgodę na połączenie prawdziwego rachunku**. Następnie wybierz bank. Autoryzacja nadal odbywa się w banku; Moneta nie zbiera loginu/hasła bankowego.

Na telefonie korzystaj z tej samej domeny HTTPS. `localhost` na telefonie oznacza telefon, a adres LAN HTTP nie jest obsługiwany jako origin bankowy. Jeśli testujesz przez tymczasowy tunel HTTPS, ustaw jego dokładny origin na serwerze i zarejestruj wynikowy callback w panelu przed autoryzacją. Zmiana domeny tunelu wymaga aktualizacji obu ustawień.

## Działanie i integralność danych

- Dynamiczne `GET /aspsps?country=PL` oraz opcjonalnie `LT` (np. poszukiwanie Revoluta). Nie ma wpisanej na sztywno listy obsługiwanych banków. Przed autoryzacją serwer sprawdza środowisko, aktywność, AIS i zarejestrowany callback poprzez `/application`.
- RS256 JWT z `kid`, `iss=enablebanking.com`, `aud=api.enablebanking.com`, `iat`, `exp`; ważność 5 minut. Sekrety nigdy nie trafiają do pakietu frontendu.
- Użytkownicy provisionowani lokalnie przez CLI, hasła scrypt. Sesje 8 godzin, HttpOnly/SameSite=Lax, Secure oraz prefiks `__Host-` na HTTPS. Zmiany wymagają zgodnego Origin i tokenu CSRF. Próby logowania są limitowane.
- Losowy state (256 bitów), 10 minut ważności, powiązany z użytkownikiem, sesją logowania i środowiskiem, atomowo konsumowany tylko raz. Kod wymieniany wyłącznie na backendzie przez `/sessions`.
- Szyfrowanie połączeń i danych bankowych AES-256-GCM w SQLite, AAD obejmuje właściciela i środowisko. Wersjonowana inicjalizacja schematu. Odczyt, synchronizacja i odłączenie są zawsze ograniczone do zalogowanego właściciela. Operacje finansowe jednego użytkownika są serializowane.
- Pierwsze pobranie obejmuje **90 dni**, w oknach do 30 dni; kolejne nakładają się na ostatnie 7 dni. Paginacja `continuation_key`, limit stron i kontrola cykli. Rzeczywisty zakres zależy od zgody i historii dostępnej w banku. Synchronizacja ręczna, minimum minuta między próbami dla połączenia. Nie ma obietnicy real-time ani niejawnego harmonogramu obciążającego bank.
- Identyfikacja kont przez `identification_hash` oraz walutę. Transakcje przez `entry_reference` (zawsze w zakresie konta). Pole `transaction_id` celowo nie służy do deduplikacji, bo według API może się zmieniać.
- Przy braku stabilnego identyfikatora fingerprint obejmuje datę, kwotę, walutę, kierunek, opis i referencję; licznik wystąpień zachowuje kilka identycznych transakcji. Takie wpisy są oznaczone do kontroli. Zmiana treści transakcji bez stabilnego ID może wymagać ręcznego rozstrzygnięcia — nie istnieje bezpieczny sposób zagwarantowania identyczności bez identyfikatora banku. Porównanie ze starymi importami PDF/ręcznymi jest konserwatywne i wymaga jawnego nadpisania ostrzeżenia.
- Oczekujące/blokady są widoczne w pobranej historii, ale do księgi trafia wyłącznie `BOOK`. Po zaksięgowaniu snapshot oczekujących jest zastępowany. Poprzednio zaksięgowane wpisy nie są automatycznie kasowane przy błędzie ani zmianie statusu.
- Import zapisuje `sourceId` i lokalną listę obsłużonych ID. Ponowna synchronizacja nie nadpisuje ręcznych opisów, kategorii ani notatek i nie odtwarza celowo usuniętych transakcji. Zmiany kwoty zaksięgowanej transakcji po imporcie wymagają porównania i ręcznej korekty w historii.
- Transfer do znanego własnego IBAN-u jest neutralny dla dochodów i wydatków. Inne transfery i niepewne uznania są oznaczone do sprawdzenia; rodzaj można poprawić przed importem i później w historii. Kategoryzacja korzysta z prostych lokalnych reguł nazw sklepów/usług oraz istniejących kategorii. Żadne dane nie są wysyłane do AI.
- Jedno wybrane saldo rachunku, bez dodawania salda dostępnego do zaksięgowanego. Nieobsługiwane waluty nie trafiają do ksiąg Moneta. Obsługiwane PLN/EUR/USD/UAH/GBP pozostają osobnymi księgami; portfel wykorzystuje dotychczasowe kursy NBP i sygnalizuje brak kursu.
- Konto nie jest automatycznie dodawane do majątku: wybierz nowy składnik albo zastąp istniejący. Jednego ręcznego składnika nie można przypisać do dwóch rachunków. Ujemne saldo trafia do zobowiązań. Data pobrania i błędy są widoczne; stara wartość nie znika po błędzie.
- Rezerwacja części salda na cel jest ograniczona do salda i tej samej waluty. Jeden rachunek można przypisać do jednego celu. Postęp celu = większa z wartości zapisanych oszczędności albo zarezerwowanego salda; nie sumujemy ich jako nowych pieniędzy. Cel nie tworzy drugiego składnika majątku. Po aktualizacji salda rezerwacja jest ograniczana do dostępnej wartości.
- Odłączenie usuwa sesję u dostawcy oraz dane połączenia z bazy. Jeśli dostawca nie potwierdzi cofnięcia zgody, UI pozwala ponowić albo jawnie usunąć lokalne dane i odwołać zgodę samodzielnie w banku. Zatwierdzone transakcje i ostatnie wartości portfela zostają w przeglądarce; można je usunąć przez istniejące narzędzia. Usunięcie danych przeglądarki nie jest odwołaniem zgody bankowej.

## Architektura i zakres testów

`server/provider.mjs` stanowi granicę dostawcy (discovery, authorize, session, inspect, revoke, balances, transactions). `banking.mjs` zarządza przepływem i synchronizacją, `store.mjs` przechowywaniem, `http.mjs` logowaniem i endpointami. To mały backend Node bez dodatkowych zależności. SQLite jest nową bazą wyłącznie dla danych wymagających serwera; istniejące księgi, kategorie i plany pozostają w IndexedDB.

`src/ConnectedBanks.tsx`, `src/banking.ts` i `src/banking.css` dodają interfejs oraz adapter do istniejących finansów. Rozszerzenia `Data.banking`, `Goal.bankSaved`, `Entry.note` są opcjonalne; stare kopie JSON są nadal poprawne. Dodano walidację nowych pól. UI nowej sekcji jest obecnie po polsku, nawigacja i dodatkowe etykiety celów mają istniejące tłumaczenia PL/EN/UK.

```powershell
npm.cmd run test:banking
npm.cmd test
npm.cmd run build
```

Testy obejmują JWT, szyfrowanie/persistencję, state/replay/owner/expiry, logowanie/CSRF/logout, callback, konta i salda, paginację, limity, duplikaty, pending→booked, waluty, transfery, zachowanie ręcznych zmian, portfel i cele. Dodatkowo widok sprawdzono w przeglądarce desktop/mobile z syntetycznym API. **Nie wykonano prawdziwej autoryzacji sandbox ani produkcyjnej, ponieważ nie skonfigurowano kluczy.** Do uruchomienia rzeczywistego połączenia potrzebne są Twoje aktywne dane dostępowe i ręczne przejście autoryzacji.

Dokumentacja użyta przy implementacji: [oficjalne API Enable Banking](https://enablebanking.com/docs/api/reference/), [oficjalne przykłady](https://github.com/enablebanking/enablebanking-api-samples). Dostępność konkretnych polskich instytucji oraz Revoluta można potwierdzić dopiero w odpowiedzi API dla Twojej aktywnej aplikacji.
