# Import transakcji

Otwórz **Transakcje → Importuj transakcje**. Import jest oddzielony od odtwarzania pełnej kopii zapasowej w Ustawieniach. Nie zastępuje istniejącego rejestru.

1. Wybierz CSV, JSON, PDF albo obraz PNG/JPEG/WebP (do 10 MB; PDF do 20 stron, obrazy do 16 MP).
2. Dla CSV dopasuj kolumny daty, opisu i kwoty. Opcjonalnie przypisz walutę, rodzaj, kategorię i identyfikator źródłowy. Wybierz DD/MM/YYYY lub MM/DD/YYYY. Podgląd pokazuje przykład z każdej kolumny.
3. Sprawdź edytowalne wiersze. Możesz poprawić datę, opis, kwotę, walutę, rodzaj i kategorię oraz wykluczyć wiersz. Widok wyświetla po 20 wierszy; maksymalnie 5000 na plik.
4. Rozstrzygnij możliwe duplikaty, zaznacz potwierdzenie i wybierz „Importuj wybrane”. Zapis całego zestawu następuje atomowo. Błąd jednego zaznaczonego wiersza blokuje import, bez częściowego zapisu.

## PDF

PDF jest odczytywany lokalnie przez PDF.js. Dokument tekstowy jest analizowany bez OCR; dla stron bez użytecznej warstwy tekstu uruchamiany jest lokalny OCR. Strony zawierające samo podsumowanie nie stają się transakcjami. Obsługiwane są dokumenty wielostronicowe oraz skany. Wybierz stronę w sekcji „Strony PDF i rozpoznany tekst”, aby porównać odczyt z oryginałem. „Powiększ podgląd” pozwala przeczytać drobny druk. Możesz poprawić tekst i ponownie wyodrębnić wiersze (zastępuje to aktualny podgląd wszystkich stron; po edycji surowego tekstu trzeba samodzielnie wskazać kierunek, jeśli utracony został układ kolumn).

Wyciągi Revoluta mają dedykowany parser: rozdziela kolumny Wydatki/Wpływy/Saldo, rozpoznaje polskie daty słowne, łączy zawinięte opisy i pomija szczegóły przewalutowania, salda oraz dane kart. Transakcje oczekujące są widoczne, lecz wykluczone domyślnie. Wymiana walut i zasilenia są proponowane jako neutralne przelewy wewnętrzne; zawsze sprawdź tę klasyfikację. Zwykłe przelewy zachowują kierunek wpływu/wydatku i przypomnienie o możliwości przelewu między własnymi rachunkami. Waluty nie są automatycznie przeliczane ani zastępowane innymi.

Po sprawdzeniu podglądu zaznacz jedno końcowe potwierdzenie „Sprawdziłem wybrane transakcje i potwierdzam import”. Nie ma osobnych checkboxów sprawdzenia każdego wiersza PDF/OCR ani dodatkowego zatwierdzania stron. Zmiana danych lub wyboru pozycji cofa końcowe potwierdzenie. Filtr „Do sprawdzenia” pokazuje błędne dane i duplikaty. Filtr „Wykluczone”, przycisk „Wyklucz duplikaty” oraz „Porównaj z oryginałem” ułatwiają pracę z dłuższymi wyciągami. Przypadki podobnych transakcji nadal wymagają rozstrzygnięcia duplikatu. Nietypowe układy innych banków mogą wymagać korekty.

## Screeny i wygoda importu

Możesz wybrać plik, przeciągnąć go do panelu lub wkleić obraz ze schowka (Ctrl+V w panelu). OCR skaluje małe obrazy, normalizuje ciemne tło i odtwarza wiersze na podstawie położenia słów. Rozpoznaje kwoty z walutą przed/po liczbie, znaki minus/plus, kwoty całkowite, nagłówki dat, „Dzisiaj”/„Wczoraj” oraz skróty miesięcy PL/EN/UK. Druga kwota przewalutowania pod transakcją nie tworzy osobnego wiersza bez opisu. Widoczne statusy oczekiwania/odrzucenia powodują domyślne wykluczenie.

Rok i waluta brakujące na screenie są uzupełniane z jawnych ustawień importu (domyślnie bieżący rok i aktywna waluta), z oznaczeniem takich wierszy. Po zmianie ustawień kliknij „Odczytaj ponownie”. Całkowicie brakującej daty ani kierunku bez znaku/kolumny importer nie zgaduje. Ręcznie dodawane transakcje i nowe ręczne wiersze importu mają dzisiejszą lokalną datę, niezależnie od miesiąca wyświetlanego w aplikacji. Istniejące transakcje i daty odczytane z pliku są zachowane.

Limit wynosi 10 MB i 20 stron. Dokumenty zabezpieczone hasłem trzeba najpierw odblokować lokalnie. Plik, obrazy stron i rozpoznany tekst nie są wysyłane na serwer ani zapisywane w rejestrze — zapis obejmuje tylko zatwierdzone transakcje.

## CSV

Obsługiwane separatory: przecinek, średnik i tabulator. Obsługiwane są BOM UTF-8, cudzysłowy, podwójne cudzysłowy wewnątrz pól i pola wielowierszowe. Liczba kolumn musi być spójna.

```csv
Data;Opis;Kwota;Waluta;Typ
04.11.2026;Wynagrodzenie;5000,00;PLN;income
04.11.2026;Lidl;-42,90;PLN;expense
04.11.2026;Zwrot za zakup;12,90;PLN;refund
04.11.2026;Między własnymi kontami;100,00;PLN;internal
```

Akceptowane kwoty: `1234.56`, `1234,56`, `1 234,56`, `1,234.56`, `1.234,56`. Niejednoznaczne `1,234` wymaga korekty — import nie zgaduje, czy chodzi o tysiąc, czy trzy miejsca dziesiętne. Gdy nie podano rodzaju, jawny minus sugeruje wydatek, jawny plus dochód. Kwota bez znaku wymaga wyboru rodzaju. Rodzaj transakcji ostatecznie określa kierunek, a kwota zapisywana jest jako dodatnia liczba groszy.

Brak kolumny waluty oznacza bieżącą walutę MONETA, co jest widoczne i edytowalne w podglądzie. Każda waluta trafia do osobnego rejestru; import nie przelicza historycznych transakcji po dzisiejszym kursie.

## JSON

Schemat: [public/examples/transactions.schema.json](public/examples/transactions.schema.json). Gotowy przykład: [public/examples/transactions.json](public/examples/transactions.json).

Wymagany obiekt główny: `{"schema":"moneta-transactions-v1","transactions":[...]}`. Każda transakcja wymaga tekstowych pól `date`, `description`, `amount`, `currency`, `type`. Kwoty JSON zapisuje się **jako tekst w głównych jednostkach waluty**, np. `"42.90"`, nie jako grosze ani zmiennoprzecinkowe liczby JSON. Daty: `YYYY-MM-DD`. Waluty: PLN, EUR, USD, UAH, GBP. Opcjonalne `category` oznacza nazwę istniejącej kategorii; `sourceId` to stabilny identyfikator poprzedzony nazwą źródła/konta, np. `bank-konto:123`.

Walidacja struktury następuje przy odczycie. Daty, limity kwot, waluty, rodzaje i relacje kategorii są ponownie sprawdzane przed zatwierdzeniem. Niepoprawny wiersz można poprawić lub odznaczyć.

## Znaczenie transakcji i duplikaty

- `income`: dochód, zwiększa dostępne środki.
- `expense`: wydatek, zwiększa wydatki miesiąca i kategorii.
- `refund`: zwrot, zmniejsza wydatki, nie jest nowym dochodem. W miesiącu bez odpowiadającego zakupu wydatki netto mogą być ujemne.
- `internal`: przelew między własnymi kontami, neutralny dla dochodu i wydatków.

Wpłaty na cele MONETA pozostają odrębnym rodzajem `transfer`, tworzonym w historii celu. Import nie zgaduje celu przelewu. Eksport CSV rejestru nie jest kopią zapasową celów — pełną historię i powiązania odtwarza kopia JSON z Ustawień.

Powtórzony `sourceId` w danej walucie blokuje ponowny import. Potencjalny duplikat bez identyfikatora jest wykrywany na podstawie daty, kwoty, rodzaju i znormalizowanego opisu, również wewnątrz jednego pliku. Użytkownik może jawnie potwierdzić, że podobne wiersze reprezentują osobne operacje. Sam plik nigdy nie nadpisuje wcześniejszej transakcji.

## OCR i prywatność

Tesseract pracuje w lokalnym Web Workerze. Skrypty, WebAssembly i modele językowe są serwowane z tej samej aplikacji. Obraz oraz rozpoznany tekst nie są przesyłane do zewnętrznego API. Pierwszy odczyt wymaga pobrania plików OCR z hostingu MONETA; kolejne mogą korzystać z pamięci podręcznej.

OCR próbuje rozpoznać daty, opisy, kwoty, waluty i jawne znaki. Nietypowy układ banku, skrócone daty bez roku, słaba jakość lub brak oznaczeń może wymagać ręcznej korekty. Obraz, tekst i wskaźnik pewności pozostają w widoku. Wystarczy jedno końcowe potwierdzenie importu po sprawdzeniu wybranych transakcji. Nieudany odczyt umożliwia poprawę tekstu lub dodanie wierszy ręcznie. Oryginalny obraz i tekst OCR nie są zapisywane w rejestrze.
