import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink, Landmark, RefreshCw, Search } from "lucide-react";

export type Institution = { name: string; country: string; beta: boolean };
const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l").trim();

export function BankSearch({ load, connect, disabled, sandbox, onError }: {
  load: (country: string) => Promise<Institution[]>;
  connect: (bank: Institution) => void;
  disabled: boolean;
  sandbox: boolean;
  onError: (error: unknown) => void;
}) {
  const [country, setCountry] = useState("PL");
  const [banks, setBanks] = useState<Institution[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [reload, setReload] = useState(0);
  const callbacks = useRef({ load, onError });
  callbacks.current = { load, onError };
  const id = useId();
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setBanks([]);
    void callbacks.current.load(country).then(result => {
      if (!cancelled) setBanks(result.sort((a, b) => a.name.localeCompare(b.name, "pl")));
    }).catch(error => {
      if (!cancelled) {
        setFailed(true);
        callbacks.current.onError(error);
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [country, reload]);
  const matches = banks.filter(bank => normalize(bank.name).includes(normalize(query)));
  const open = focused && !loading && !failed && !!query.trim();
  function choose(bank: Institution) {
    if (disabled || loading) return;
    setFocused(false);
    connect(bank);
  }
  return <>
    <div className="bank-discovery">
      <label>Kraj
        <select value={country} onChange={event => {
          setCountry(event.target.value); setQuery(""); setActive(-1); setFocused(false);
        }}>
          <option value="PL">Polska</option>
          <option value="LT">Litwa (np. Revolut)</option>
        </select>
      </label>
      <div className="bank-autocomplete" onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}>
        <label htmlFor={`${id}-input`}>Szukaj banku</label>
        <div className="bank-search-input">
          <Search size={17} aria-hidden="true" />
          <input id={`${id}-input`} role="combobox" autoComplete="off"
            aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`}
            aria-describedby={`${id}-help`}
            aria-activedescendant={open && active >= 0 && matches[active] ? `${id}-${active}` : undefined}
            value={query} placeholder={loading ? "Pobieranie banków…" : "Wpisz nazwę banku"}
            onFocus={() => setFocused(true)}
            onChange={event => { setQuery(event.target.value); setActive(-1); setFocused(true); }}
            onKeyDown={event => {
              if (event.key === "Escape") { setFocused(false); setActive(-1); }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault(); setFocused(true);
                setActive(index => !matches.length ? -1 : index < 0 ? (event.key === "ArrowDown" ? 0 : matches.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
              }
              if (event.key === "Enter" && open && active >= 0 && matches[active]) {
                event.preventDefault(); choose(matches[active]);
              }
            }} />
          {!!query && <button type="button" aria-label="Wyczyść wyszukiwanie banku" onClick={() => {setQuery(""); setActive(-1);}}>×</button>}
        </div>
        {open && <div className="bank-suggestions liquid-glass" id={`${id}-list`} role="listbox" aria-label="Podpowiedzi banków">
          {matches.map((bank, index) => <button type="button" role="option" aria-selected={index === active}
            id={`${id}-${index}`} key={`${bank.country}:${bank.name}`} tabIndex={-1}
            disabled={disabled} className={index === active ? "active" : ""}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(bank)}>
            <Landmark size={18} /><span>{bank.name}{bank.beta ? " · beta" : ""}</span><ExternalLink size={15} />
          </button>)}
          {!matches.length && <p>Brak „{query}” na liście {sandbox ? "Sandbox" : "banków"} dla tego kraju.</p>}
        </div>}
      </div>
      <button className="button secondary" disabled={loading || disabled} onClick={() => setReload(value => value + 1)}>
        <RefreshCw size={16} className={loading ? "spin" : ""} /> {loading ? "Pobieranie…" : "Odśwież listę banków"}
      </button>
    </div>
    <p id={`${id}-help`} className="bank-search-help">
      {sandbox ? "Sandbox udostępnia ograniczoną listę banków testowych. Wyszukiwarka podpowiada wyłącznie pozycje dostępne w Twojej konfiguracji." : "Wybierz bank z podpowiedzi, aby przejść do autoryzacji. Jeśli nie widzisz Revolut w Polsce, sprawdź Litwę."}
    </p>
    {!loading && !failed && query.trim() && !matches.length && <p role="status">Brak dopasowania. Poniżej znajdziesz wszystkie dostępne banki — możesz też zmienić kraj.</p>}
    {!loading && !failed && <div className="bank-available">
      <h3>Dostępne banki{sandbox ? " w Sandbox" : ""} ({banks.length})</h3>
      <div className="bank-institutions">
        {banks.map(bank => <button className="button secondary" key={`${bank.country}:${bank.name}`} disabled={disabled} onClick={() => choose(bank)}>
          <Landmark size={18} />{bank.name}{bank.beta ? " · beta" : ""}<ExternalLink size={15} />
        </button>)}
      </div>
      {!banks.length && <p>Enable Banking nie udostępnia banków dla tego kraju w wybranym środowisku. Spróbuj zmienić kraj.</p>}
    </div>}
    {failed && <p>Nie udało się pobrać listy banków. Użyj przycisku „Odśwież listę banków”, aby spróbować ponownie.</p>}
  </>;
}
