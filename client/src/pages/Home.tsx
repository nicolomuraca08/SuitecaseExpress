import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { jsPDF } from "jspdf";
import {
  ArrowRight, Bell, CalendarDays, CalendarPlus, Check, CheckCircle2, ChevronDown, ClipboardCheck, Loader2,
  Copy, CreditCard, Download, FileText, Luggage, LockKeyhole, MapPin, Plane,
  Mail, MessageCircle, Moon, Plus, RotateCcw, Send, Share2, ShieldCheck, Sparkles, Sun, SunMedium, Ticket, Trash2, Users,
  WalletCards, Umbrella, Utensils, Coins, AlertTriangle, CloudRain, ThermometerSun, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTheme } from "@/contexts/ThemeContext";

type Month = "Gennaio" | "Febbraio" | "Marzo" | "Aprile" | "Maggio" | "Giugno" | "Luglio" | "Agosto" | "Settembre" | "Ottobre" | "Novembre" | "Dicembre";
type Luggage = "Solo Zaino" | "Trolley 10kg" | "Stiva";
type Traveler = "Da solo/a" | "Coppia" | "Bambini" | "Amici";
type WeatherDay = { date: string; code: number; min: number; max: number; precipitation: number };
type WeatherForecast = { city: string; country: string; countryCode: string; timezone: string; days: WeatherDay[]; rainy: boolean; sunny: boolean };
type ChecklistCategory = { title: string; icon: string; items: string[] };
type TripDay = { day: number; date: string; morning: string; afternoon: string; evening: string };
type TravelInsights = { dishes: string[]; traps: string; currency: string; tips: string };
type TravelPlan = { destination: string; month: Month; startDate: string; endDate: string; duration: number; luggage: Luggage; traveler: Traveler; categories: ChecklistCategory[]; itinerary: TripDay[]; weather?: WeatherForecast; insights: TravelInsights };
type ContactFieldErrors = { name?: string; email?: string; topic?: string; message?: string };
const contactTopics = ["Supporto", "Segnalazione bug", "Informazioni", "Pagamento", "Suggerimento"] as const;

function DestinationMap({ plan }: { plan: TravelPlan }) {
  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number } | null>(null);
  const [mapLoading, setMapLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setMapLoading(true);
    fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(plan.destination)}`)
      .then((response) => response.ok ? response.json() as Promise<Array<{ lat: string; lon: string }>> : [])
      .then((results) => { if (active && results[0]) setCoordinates({ lat: Number(results[0].lat), lon: Number(results[0].lon) }); })
      .catch(() => { if (active) setCoordinates(null); })
      .finally(() => { if (active) setMapLoading(false); });
    return () => { active = false; };
  }, [plan.destination]);
  const mapUrl = coordinates ? `https://www.openstreetmap.org/export/embed.html?bbox=${coordinates.lon - .08}%2C${coordinates.lat - .05}%2C${coordinates.lon + .08}%2C${coordinates.lat + .05}&layer=mapnik&marker=${coordinates.lat}%2C${coordinates.lon}` : "";
  return <section className="trip-map-card" aria-labelledby="trip-map-title"><div className="panel-heading"><span className="panel-icon panel-icon-blue"><MapPin className="size-5" /></span><div><p className="eyebrow text-sky-700">Percorso visivo</p><h3 id="trip-map-title" className="font-display text-2xl font-black">Le tappe di {plan.destination}</h3></div></div><div className="trip-map-layout">{mapLoading ? <div className="map-placeholder" role="status"><Loader2 className="size-5 animate-spin" /> Carico la mappa…</div> : coordinates ? <iframe className="trip-map-frame" title={`Mappa di ${plan.destination}`} src={mapUrl} loading="lazy" /> : <div className="map-placeholder">Mappa non disponibile per questa destinazione.</div>}<div className="map-stops">{plan.itinerary.slice(0, 3).map((day) => <div className="map-stop" key={day.day}><span>{String(day.day).padStart(2, "0")}</span><div><strong>Giorno {day.day}</strong><p>{day.morning}</p></div></div>)}</div></div>{coordinates && <a className="map-open-link" href={`https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lon}#map=12/${coordinates.lat}/${coordinates.lon}`} target="_blank" rel="noopener noreferrer">Apri la mappa interattiva completa <ArrowRight className="size-4" /></a>}</section>;
}

const months: Month[] = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const luggageOptions: Luggage[] = ["Solo Zaino", "Trolley 10kg", "Stiva"];
const travelerOptions: Traveler[] = ["Da solo/a", "Coppia", "Bambini", "Amici"];
const publicKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = publicKey ? loadStripe(publicKey) : null;
const WEATHER_NOTIFICATIONS_STORAGE_KEY = "valigia-perfetta-weather-notifications";
const MAX_CONTACT_ATTACHMENTS = 5;
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;
type ContactAttachment = { file: File; originalBytes: number; compressionPercent: number };

async function compressContactImage(file: File): Promise<File> {
  const maxBytes = 1.5 * 1024 * 1024;
  if (file.size <= maxBytes) return file;
  return new Promise((resolve) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, 2200 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob || blob.size >= file.size) { resolve(file); return; }
        resolve(new File([blob], `${file.name.replace(/\.[^/.]+$/, "")}-compressed.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
      }, "image/jpeg", .82);
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    image.src = objectUrl;
  });
}
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
const CONTACT_COOLDOWN_STORAGE_KEY = "valigia-perfetta-contact-last-submit";
const BUDDYBANK_INVITE_CODE = "B2601M9RKWDPQ8";

type RecaptchaApi = { ready: (callback: () => void) => void; execute: (siteKey: string, options: { action: string }) => Promise<string> };

async function getRecaptchaToken() {
  if (!RECAPTCHA_SITE_KEY) throw new Error("reCAPTCHA non configurato.");
  const captchaWindow = window as Window & { grecaptcha?: RecaptchaApi };
  if (!captchaWindow.grecaptcha) {
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>("script[data-recaptcha='true']");
      if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("reCAPTCHA non disponibile.")), { once: true }); return; }
      const script = document.createElement("script"); script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(RECAPTCHA_SITE_KEY!)}`; script.async = true; script.defer = true; script.dataset.recaptcha = "true"; script.onload = () => resolve(); script.onerror = () => reject(new Error("reCAPTCHA non disponibile.")); document.head.appendChild(script);
    });
  }
  if (!captchaWindow.grecaptcha) throw new Error("reCAPTCHA non disponibile.");
  return new Promise<string>((resolve, reject) => captchaWindow.grecaptcha!.ready(() => { captchaWindow.grecaptcha!.execute(RECAPTCHA_SITE_KEY!, { action: "contact_submit" }).then(resolve).catch(() => reject(new Error("Verifica anti-spam non disponibile."))); }));
}

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return dateInputValue(date);
}
function inclusiveDays(start: string, end: string) {
  return Math.max(1, Math.round((new Date(`${end}T12:00:00`).getTime() - new Date(`${start}T12:00:00`).getTime()) / 86400000) + 1);
}
function monthFromDate(value: string): Month {
  return months[new Date(`${value}T12:00:00`).getMonth()];
}
function readableDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
}
function weatherLabel(code: number) {
  if (code >= 95) return "Temporale";
  if (code >= 61) return "Pioggia";
  if (code >= 51) return "Pioviggine";
  if (code >= 3) return "Nuvoloso";
  return "Sole";
}
function weatherEmoji(code: number) {
  if (code >= 95) return "⛈️";
  if (code >= 61) return "🌧️";
  if (code >= 51) return "🌦️";
  if (code >= 3) return "☁️";
  return "☀️";
}

export async function fetchWeather(destination: string, startDate: string, endDate: string): Promise<WeatherForecast> {
  const geoResponse = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1&language=it&format=json`);
  if (!geoResponse.ok) throw new Error("Impossibile trovare la destinazione.");
  const geo = await geoResponse.json() as { results?: Array<{ name: string; country?: string; country_code?: string; latitude: number; longitude: number; timezone: string }> };
  const place = geo.results?.[0];
  if (!place) throw new Error("Destinazione non trovata. Prova con una città più precisa.");
  const forecastResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${startDate}&end_date=${endDate}`);
  if (!forecastResponse.ok) throw new Error("Previsioni meteo non disponibili per queste date.");
  const forecast = await forecastResponse.json() as { daily?: { time: string[]; weather_code: number[]; temperature_2m_min: number[]; temperature_2m_max: number[]; precipitation_probability_max: number[] } };
  const daily = forecast.daily;
  if (!daily?.time?.length) throw new Error("Nessuna previsione disponibile per le date selezionate.");
  const days = daily.time.map((date, index) => ({ date, code: daily.weather_code[index] ?? 0, min: Math.round(daily.temperature_2m_min[index] ?? 0), max: Math.round(daily.temperature_2m_max[index] ?? 0), precipitation: Math.round(daily.precipitation_probability_max[index] ?? 0) }));
  return { city: place.name, country: place.country ?? "", countryCode: (place.country_code ?? "").toUpperCase(), timezone: place.timezone, days, rainy: days.some((day) => day.precipitation >= 35 || day.code >= 51), sunny: days.some((day) => day.code <= 2 && day.max >= 24) };
}

function getInsights(destination: string): TravelInsights {
  const value = destination.toLowerCase();
  if (value.includes("kyoto") || value.includes("giappone") || value.includes("tokyo")) return { dishes: ["Ramen artigianale", "Okonomiyaki", "Matcha e wagashi"], traps: "Diffida dei locali con menu fotografico e prezzi non esposti nelle zone più turistiche.", currency: "Yen giapponese (JPY). In Giappone le mance non sono normalmente richieste.", tips: "Nei ristoranti tradizionali basta ringraziare; arrotondare non è necessario." };
  if (value.includes("lisbona") || value.includes("portogallo")) return { dishes: ["Bacalhau", "Pastel de nata", "Bifana"], traps: "Evita i ristoranti con camerieri insistenti vicino a Praça do Comércio: confronta sempre il menu.", currency: "Euro (EUR). La mancia è facoltativa, spesso si lascia il 5–10% per un buon servizio.", tips: "Controlla sempre se il servizio è già incluso nel conto." };
  if (value.includes("puglia") || value.includes("italia") || value.includes("roma") || value.includes("milano")) return { dishes: ["Orecchiette alle cime di rapa", "Focaccia barese", "Gelato artigianale"], traps: "Per evitare prezzi turistici, allontanati di qualche strada dalle piazze principali e guarda dove mangiano i residenti.", currency: "Euro (EUR). La mancia non è obbligatoria; arrotondare è un gesto apprezzato.", tips: "Il coperto può essere indicato separatamente: controlla il menu prima di ordinare." };
  return { dishes: ["Specialità stagionale locale", "Street food tipico", "Dolce tradizionale"], traps: "Evita i locali con menu tradotti in troppe lingue e senza prezzi chiari vicino ai monumenti.", currency: "Verifica il cambio della valuta locale rispetto all’Euro prima di partire.", tips: "Lascia la mancia solo se il servizio è stato buono e controlla prima eventuali costi di servizio." };
}

const mealAreasByCountry: Record<string, string> = { IT: "Italian", PT: "Portuguese", ES: "Spanish", FR: "French", DE: "German", GR: "Greek", JP: "Japanese", CN: "Chinese", IN: "Indian", MX: "Mexican", TH: "Thai", TR: "Turkish", US: "American", GB: "British", MA: "Moroccan", EG: "Egyptian", JM: "Jamaican", IE: "Irish", NL: "Dutch", PL: "Polish", HR: "Croatian", VN: "Vietnamese", MY: "Malaysian", PH: "Filipino" };

export async function fetchDestinationInsights(destination: string, weather: WeatherForecast): Promise<TravelInsights> {
  const fallback = getInsights(destination);
  const countryCode = weather.countryCode.toLowerCase();
  try {
    const countryResponse = await fetch(`https://restcountries.com/v3.1/alpha/${encodeURIComponent(countryCode)}?fields=name,currencies`);
    if (!countryResponse.ok) return fallback;
    const countryData = await countryResponse.json() as Array<{ name?: { common?: string }; currencies?: Record<string, { name?: string; symbol?: string }> }>;
    const country = countryData[0];
    const currencyEntry = Object.entries(country?.currencies ?? {})[0];
    const currency = currencyEntry ? `${currencyEntry[1].name ?? currencyEntry[0]} (${currencyEntry[0]}${currencyEntry[1].symbol ? ` · ${currencyEntry[1].symbol}` : ""})` : fallback.currency;
    let dishes = fallback.dishes;
    const area = mealAreasByCountry[weather.countryCode] ?? weather.country;
    const mealResponse = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?a=${encodeURIComponent(area)}`);
    if (mealResponse.ok) {
      const meals = await mealResponse.json() as { meals?: Array<{ strMeal?: string }> };
      const names = (meals.meals ?? []).map((meal) => meal.strMeal).filter((name): name is string => Boolean(name));
      if (names.length >= 3) dishes = names.slice(0, 3);
    }
    return { ...fallback, dishes, currency: `Valuta locale: ${currency}. Per il cambio EUR, verifica il tasso del giorno prima di partire.`, traps: `A ${weather.city}, in ${country?.name?.common ?? weather.country}, confronta sempre menu e prezzi prima di sederti. ${fallback.traps}`, tips: fallback.tips };
  } catch {
    return fallback;
  }
}

export function validateContactForm(name: string, email: string, message: string) {
  const cleanName = name.trim();
  const cleanEmail = email.trim();
  const cleanMessage = message.trim();
  const nameIsValid = /^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ .'-]{1,49}$/.test(cleanName) && cleanName.split(/\s+/).some((part) => part.length >= 2);
  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail);
  const messageLetters = (cleanMessage.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) ?? []).length;
  const messageWords = cleanMessage.split(/\s+/).filter((word) => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(word));
  const repeatedText = /(.)\1{5,}/.test(cleanMessage.replace(/\s/g, ""));
  const nonsenseMessage = /^(ciao|test|prova|asdf|qwerty|boh|bla|lol|ok)+[.!?\s]*$/i.test(cleanMessage);
  return Boolean(nameIsValid && emailIsValid && cleanMessage.length >= 15 && cleanMessage.length <= 2000 && messageLetters >= 8 && messageWords.length >= 2 && !repeatedText && !nonsenseMessage);
}

export function getContactFieldErrors(name: string, email: string, topic = "", message = ""): ContactFieldErrors {
  const errors: ContactFieldErrors = {};
  const cleanName = name.trim();
  const cleanEmail = email.trim();
  const cleanMessage = message.trim();
  if (!cleanName) errors.name = "Inserisci il tuo nome.";
  else if (!/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ .'-]{1,49}$/.test(cleanName)) errors.name = "Inserisci un nome valido.";
  if (!cleanEmail) errors.email = "Inserisci la tua email.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) errors.email = "Inserisci un indirizzo email valido.";
  if (!topic) errors.topic = "Seleziona l’argomento della richiesta.";
  if (!cleanMessage) errors.message = "Scrivi il messaggio per il supporto.";
  else if (cleanMessage.length < 15) errors.message = "Il messaggio deve contenere almeno 15 caratteri.";
  else if (!validateContactForm(cleanName, cleanEmail, cleanMessage)) errors.message = "Descrivi brevemente la tua richiesta con parole comprensibili.";
  return errors;
}

export function buildPlan(destination: string, startDate: string, endDate: string, luggage: Luggage, traveler: Traveler, weather?: WeatherForecast, insights?: TravelInsights): TravelPlan {
  const place = destination.trim().replace(/\s+/g, " ");
  const duration = inclusiveDays(startDate, endDate);
  const climate = weather?.rainy ? "variabile con possibili piogge" : weather?.sunny ? "caldo e soleggiato" : "mite e variabile";
  const clothingCount = Math.min(8, Math.max(3, Math.ceil(duration / 2) + 2));
  const clothes = [`${clothingCount} cambi adatti al clima ${climate}`, "1 giacca leggera o strato caldo", "Biancheria e calze per ogni giorno + 1 extra", "Scarpe comode per camminare", "Pigiama e costume da bagno"];
  if (luggage === "Solo Zaino") clothes.push("Sacca organizer comprimibile");
  if (luggage === "Stiva") clothes.push("Secondo paio di scarpe in custodia");
  const beauty = ["Spazzolino e dentifricio formato viaggio", "Crema solare SPF 30+", "Mini kit farmaci personali", "Gel igienizzante"];
  const extra = [...(traveler === "Da solo/a" ? ["Lucchetto TSA", "Mini taccuino di viaggio"] : traveler === "Coppia" ? ["Adattatore doppio", "Borsa pieghevole condivisa"] : traveler === "Bambini" ? ["Snack e borraccia per bambini", "Cambio completo di riserva", "Piccolo kit intrattenimento"] : ["Power bank condiviso", "Giochi da viaggio", "Borraccia riutilizzabile"]), "Borraccia vuota per i controlli"];
  if (weather?.rainy) extra.push("Ombrello compatto o poncho impermeabile");
  if (weather?.sunny && !beauty.includes("Crema solare SPF 30+")) beauty.push("Crema solare SPF 50+");
  const categories: ChecklistCategory[] = [
    { title: "Documenti", icon: "ticket", items: ["Documento d’identità valido", "Biglietti e prenotazioni offline", "Assicurazione viaggio", "Carta e un po’ di contanti"] },
    { title: "Abiti", icon: "shirt", items: clothes },
    { title: "Elettronica", icon: "bolt", items: ["Smartphone + caricatore", "Power bank", "Adattatore universale", "Auricolari"] },
    { title: "Beauty", icon: "drop", items: beauty },
    { title: "Extra", icon: "sparkle", items: extra },
  ];
  const itinerary = Array.from({ length: duration }, (_, index) => {
    const day = index + 1;
    const date = addDays(startDate, index);
    const focus = day === 1 ? "il centro storico" : day === duration ? "il quartiere più autentico" : `una zona speciale di ${place}`;
    return { day, date, morning: day === 1 ? `Passeggiata di orientamento tra i simboli di ${place}` : `Colazione lenta e scoperta di ${focus}`, afternoon: day === duration ? `Ultime botteghe, panorama e acquisti ricordo a ${place}` : `Esperienza locale: mercato, museo o sapore tipico di ${place}`, evening: traveler === "Bambini" ? "Cena presto in un posto easy, poi rientro senza fretta" : `Aperitivo panoramico e cena tipica a ${place}` };
  });
  return { destination: place, month: monthFromDate(startDate), startDate, endDate, duration, luggage, traveler, categories, itinerary, weather, insights: insights ?? getInsights(place) };
}

function GenerationSkeleton({ progress }: { progress: number }) {
  return <div className="generation-skeleton" role="status" aria-live="polite"><div className="generation-skeleton-card"><div className="skeleton-kicker" /><div className="skeleton-title" /><div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-grid"><div><div className="skeleton-block tall" /><div className="skeleton-block" /><div className="skeleton-block" /></div><div><div className="skeleton-block tall" /><div className="skeleton-block" /><div className="skeleton-block" /></div></div><div className="generation-skeleton-message"><Sparkles className="size-4" /> Sto costruendo la tua valigia e il tuo itinerario… <strong>{progress}%</strong></div><div className="generation-progress" aria-label={`Generazione completata al ${progress}%`}><span style={{ width: `${progress}%` }} /></div></div></div>;
}

function IconBadge({ icon }: { icon: string }) {
  const icons: Record<string, ReactNode> = { ticket: <Ticket className="size-5" />, shirt: <Luggage className="size-5" />, bolt: <WalletCards className="size-5" />, drop: <ShieldCheck className="size-5" />, sparkle: <Sparkles className="size-5" /> };
  return <span className="category-icon">{icons[icon]}</span>;
}

function StripeCheckoutForm({ onPaid }: { onPaid: () => void }) {
  const stripe = useStripe(); const elements = useElements(); const [isPaying, setIsPaying] = useState(false); const [error, setError] = useState("");
  const submitPayment = async (event: FormEvent) => { event.preventDefault(); if (!stripe || !elements) return; setIsPaying(true); setError(""); const result = await stripe.confirmPayment({ elements, redirect: "if_required" }); if (result.error) setError(result.error.message ?? "Controlla i dati della carta e riprova."); else if (result.paymentIntent?.status === "succeeded") onPaid(); else setError(`Pagamento non ancora completato (${result.paymentIntent?.status ?? "stato sconosciuto"}).`); setIsPaying(false); };
  return <form onSubmit={submitPayment} className="space-y-4"><PaymentElement options={{ layout: "tabs" }} />{error && <p className="text-sm font-medium text-red-600">{error}</p>}<Button type="submit" disabled={!stripe || isPaying} className="w-full rounded-2xl bg-emerald-600 py-6 text-base font-bold text-white shadow-lg shadow-emerald-900/10 hover:bg-emerald-700"><LockKeyhole className="size-4" /> {isPaying ? "Verifica in corso…" : "Sblocca il mio piano · 3,99 €"}</Button><p className="flex items-center justify-center gap-2 text-center text-xs text-slate-500"><ShieldCheck className="size-3.5 text-emerald-600" /> Pagamento sicuro con Stripe. Nessun dato carta viene salvato.</p></form>;
}

function Paywall({ plan, onPaid }: { plan: TravelPlan; onPaid: () => void }) {
  const [clientSecret, setClientSecret] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const startPayment = async () => {
    setError("");
    if (!stripePromise) { onPaid(); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/create-payment-intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination: plan.destination, duration: plan.duration }) });
      const data = await response.json() as { clientSecret?: string; error?: string };
      if (!response.ok || !data.clientSecret) throw new Error(data.error ?? "Impossibile preparare il pagamento.");
      setClientSecret(data.clientSecret);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Impossibile preparare il pagamento."); }
    finally { setLoading(false); }
  };
  return <section className="paywall-card" aria-labelledby="unlock-title"><div className="paywall-lock"><LockKeyhole className="size-5" /></div><p className="eyebrow text-emerald-700">Il tuo piano è pronto</p><h2 id="unlock-title" className="mt-2 font-display text-3xl font-black tracking-tight text-slate-950">Una valigia più leggera. Un viaggio più pieno.</h2><p className="mt-3 max-w-xl text-base leading-7 text-slate-600">Sblocca tutte le categorie, il meteo e ogni tappa personalizzata per {plan.destination}.</p><div className="mt-5 grid gap-3 sm:grid-cols-3">{[[<ClipboardCheck className="size-4" />, "Checklist completa"], [<CalendarDays className="size-4" />, `${plan.duration} giorni organizzati`], [<FileText className="size-4" />, "PDF e calendario"]].map(([icon, label]) => <div key={label as string} className="benefit-pill">{icon}<span>{label}</span></div>)}</div><div className="mt-6 rounded-3xl border border-slate-200 bg-white/80 p-4 sm:p-5">{!clientSecret ? <><div className="mb-4 flex items-center justify-between gap-4"><div><p className="font-bold text-slate-900">Sblocco una tantum</p><p className="text-sm text-slate-500">Valigia + itinerario completo</p></div><span className="price-tag">3,99 €</span></div><Button onClick={startPayment} disabled={loading} className="w-full rounded-2xl bg-emerald-600 py-6 text-base font-bold text-white hover:bg-emerald-700">{loading ? "Preparo il pagamento…" : stripePromise ? <><CreditCard className="size-4" /> Continua al pagamento sicuro</> : <><Sparkles className="size-4" /> Sblocca anteprima demo</>} <ArrowRight className="size-4" /></Button>{!stripePromise && <p className="mt-3 text-center text-xs text-slate-500">Modalità demo: configura le chiavi Stripe per attivare il pagamento reale.</p>}{error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}</> : <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#059669", borderRadius: "16px", fontFamily: "Manrope, sans-serif" } } }}><StripeCheckoutForm onPaid={onPaid} /></Elements>}</div></section>;
}

function buildICS(plan: TravelPlan) {
  const escape = (value: string) => value.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const date = (value: string) => value.replaceAll("-", "");
  const events = plan.itinerary.flatMap((day) => [
    ["Mattina", day.morning, "09:00", "12:00"], ["Pomeriggio", day.afternoon, "14:00", "17:00"], ["Sera", day.evening, "19:00", "22:00"],
  ].map(([label, text, start, end]) => `BEGIN:VEVENT\nUID:valigia-${plan.startDate}-${day.day}-${label}@itinerario-express\nDTSTART:${date(day.date)}T${start.replace(":", "")}00\nDTEND:${date(day.date)}T${end.replace(":", "")}00\nSUMMARY:${escape(`${label} · ${plan.destination}`)}\nDESCRIPTION:${escape(text)}\nBEGIN:VALARM\nTRIGGER:-PT30M\nACTION:DISPLAY\nDESCRIPTION:Tra 30 minuti: ${escape(`${label} · ${plan.destination}`)}\nEND:VALARM\nEND:VEVENT`));
  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Valigia Perfetta//Itinerario Express//IT\nCALSCALE:GREGORIAN\n${events.join("\n")}\nEND:VCALENDAR`;
}

function googleCalendarUrl(plan: TravelPlan) {
  const date = (value: string, time: string) => `${value.replaceAll("-", "")}T${time.replace(":", "")}00`;
  const first = plan.itinerary[0]; const last = plan.itinerary[plan.itinerary.length - 1];
  const details = `Itinerario completo per ${plan.destination}.\n\n${plan.itinerary.map((day) => `GIORNO ${day.day} · ${readableDate(day.date)}\nMattina: ${day.morning}\nPomeriggio: ${day.afternoon}\nSera: ${day.evening}`).join("\n\n")}\n\nPromemoria consigliati: 24 ore e 2 ore prima.`;
  const params = new URLSearchParams({ action: "TEMPLATE", text: `Viaggio a ${plan.destination}`, dates: `${date(first.date, "09:00")}/${date(last.date, "22:00")}`, details, location: plan.destination, ctz: "Europe/Rome", reminders: "1440,120" });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const tomorrow = useMemo(() => { const date = new Date(); date.setDate(date.getDate() + 1); return dateInputValue(date); }, []);
  const defaultReturn = useMemo(() => addDays(tomorrow, 3), [tomorrow]);
  const [destination, setDestination] = useState(""); const [startDate, setStartDate] = useState(tomorrow); const [endDate, setEndDate] = useState(defaultReturn); const [luggage, setLuggage] = useState<Luggage>("Trolley 10kg"); const [traveler, setTraveler] = useState<Traveler>("Da solo/a"); const [plan, setPlan] = useState<TravelPlan | null>(null); const [isGenerating, setIsGenerating] = useState(false); const [generationProgress, setGenerationProgress] = useState(0); const [unlocked, setUnlocked] = useState(false); const [done, setDone] = useState<Record<string, boolean>>({}); const [notice, setNotice] = useState(""); const [weatherLoading, setWeatherLoading] = useState(false); const [weatherError, setWeatherError] = useState(""); const [newItem, setNewItem] = useState(""); const [bonusCopied, setBonusCopied] = useState(false); const [weatherNotifications, setWeatherNotifications] = useState(() => { if (typeof window === "undefined") return false; return window.localStorage.getItem(WEATHER_NOTIFICATIONS_STORAGE_KEY) === "true" && (!("Notification" in window) || Notification.permission !== "denied"); }); const [notificationMessage, setNotificationMessage] = useState(""); const [contactOpen, setContactOpen] = useState(false); const [contactName, setContactName] = useState(""); const [contactEmail, setContactEmail] = useState(""); const [contactTopic, setContactTopic] = useState(""); const [contactMessage, setContactMessage] = useState(""); const [contactAttachments, setContactAttachments] = useState<ContactAttachment[]>([]); const [contactCompressing, setContactCompressing] = useState(false); const [contactDragActive, setContactDragActive] = useState(false); const [contactSent, setContactSent] = useState(false); const [contactSubmitting, setContactSubmitting] = useState(false); const [contactVerifyingCaptcha, setContactVerifyingCaptcha] = useState(false); const [contactCooldownSeconds, setContactCooldownSeconds] = useState(() => { if (typeof window === "undefined") return 0; const elapsed = Date.now() - Number(window.localStorage.getItem(CONTACT_COOLDOWN_STORAGE_KEY) ?? "0"); return Math.max(0, Math.ceil((60_000 - elapsed) / 1000)); }); const [contactError, setContactError] = useState(""); const [contactFieldErrors, setContactFieldErrors] = useState<ContactFieldErrors>({}); const weatherRequest = useRef(0); const lastWeatherSignature = useRef(""); const contactCloseTimer = useRef<number | null>(null);
  const allItems = useMemo(() => plan?.categories.flatMap((category) => category.items) ?? [], [plan]); const doneCount = allItems.filter((item) => done[item]).length;
  useEffect(() => { window.localStorage.setItem(WEATHER_NOTIFICATIONS_STORAGE_KEY, String(weatherNotifications)); }, [weatherNotifications]);
  useEffect(() => { const updateCooldown = () => { const elapsed = Date.now() - Number(window.localStorage.getItem(CONTACT_COOLDOWN_STORAGE_KEY) ?? "0"); setContactCooldownSeconds(Math.max(0, Math.ceil((60_000 - elapsed) / 1000))); }; updateCooldown(); const interval = window.setInterval(updateCooldown, 1000); return () => window.clearInterval(interval); }, []);
  useEffect(() => { if (!weatherNotifications || !plan) return; const checkWeather = async () => { try { const fresh = await fetchWeather(plan.destination, plan.startDate, plan.endDate); const signature = fresh.days.map((day) => `${day.date}:${day.code}:${day.min}:${day.max}:${day.precipitation}`).join("|"); if (lastWeatherSignature.current && signature !== lastWeatherSignature.current && "Notification" in window && Notification.permission === "granted") { const rainyDay = fresh.days.find((day) => day.precipitation >= 50 || day.code >= 51); new Notification(`Aggiornamento meteo · ${fresh.city}`, { body: rainyDay ? `${weatherEmoji(rainyDay.code)} ${readableDate(rainyDay.date)}: ${weatherLabel(rainyDay.code)}, ${rainyDay.min}–${rainyDay.max}° e ${rainyDay.precipitation}% di pioggia.` : `Previsioni aggiornate: ${fresh.days[0]?.min}–${fresh.days[0]?.max}° a ${fresh.city}.` }); setNotificationMessage("Previsioni aggiornate: ti avviseremo se cambia il meteo."); } lastWeatherSignature.current = signature; } catch { /* Il widget resta sull’ultimo dato valido. */ } }; void checkWeather(); const interval = window.setInterval(() => void checkWeather(), 15 * 60 * 1000); return () => window.clearInterval(interval); }, [weatherNotifications, plan?.destination, plan?.startDate, plan?.endDate]);
  const reportText = plan ? `VALIGIA PERFETTA · ${plan.destination}\n${readableDate(plan.startDate)} – ${readableDate(plan.endDate)} · ${plan.duration} giorni · ${plan.luggage} · ${plan.traveler}\n\nCHECKLIST\n${plan.categories.map((category) => `\n${category.title}\n${category.items.map((item) => `${done[item] ? "✓" : "□"} ${item}`).join("\n")}`).join("\n")}\n\nITINERARIO\n${plan.itinerary.map((day) => `\nGIORNO ${day.day} · ${readableDate(day.date)}\nMattina: ${day.morning}\nPomeriggio: ${day.afternoon}\nSera: ${day.evening}`).join("\n")}` : "";

  const generate = (event: FormEvent) => {
    event.preventDefault();
    if (!destination.trim() || endDate < startDate) return;
    const request = ++weatherRequest.current;
    const initialPlan = buildPlan(destination, startDate, endDate, luggage, traveler);
    setPlan(initialPlan); setGenerationProgress(18); setIsGenerating(true); setUnlocked(false); setDone({}); setNotice(""); setWeatherError(""); setWeatherLoading(true);
    setTimeout(() => document.getElementById("preview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
    fetchWeather(destination, startDate, endDate).then(async (weather) => { if (request !== weatherRequest.current) return; setGenerationProgress(58); const insights = await fetchDestinationInsights(destination, weather); if (request !== weatherRequest.current) return; setGenerationProgress(92); setPlan((current) => current ? buildPlan(current.destination, current.startDate, current.endDate, current.luggage, current.traveler, weather, insights) : current); setGenerationProgress(100); setIsGenerating(false); }).catch((error: unknown) => { if (request === weatherRequest.current) { setWeatherError(error instanceof Error ? error.message : "Dati destinazione non disponibili"); setGenerationProgress(100); setIsGenerating(false); } }).finally(() => { if (request === weatherRequest.current) setWeatherLoading(false); });
  };
  const copyReport = async () => { await navigator.clipboard.writeText(reportText); setNotice("Resoconto copiato negli appunti."); setTimeout(() => setNotice(""), 2400); };
  const copyBuddybankCode = async () => { await navigator.clipboard.writeText(BUDDYBANK_INVITE_CODE); setBonusCopied(true); window.setTimeout(() => setBonusCopied(false), 2000); };
  const shareText = plan ? `Il mio piano di viaggio per ${plan.destination}: checklist valigia e itinerario personalizzato. Creato con Valigia Perfetta & Itinerario Express.` : "";
  const shareItinerary = async () => { if (!plan) return; if (typeof navigator !== "undefined" && "share" in navigator) { try { await navigator.share({ title: `Itinerario per ${plan.destination}`, text: shareText, url: window.location.href }); setNotice("Itinerario condiviso."); window.setTimeout(() => setNotice(""), 2400); } catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; setNotice("Condivisione non disponibile: usa WhatsApp o Telegram."); } } else { setNotice("La condivisione nativa non è supportata da questo browser."); } };
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${window.location.href}`)}`;
  const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(shareText)}`;
  const calendarUrl = plan ? googleCalendarUrl(plan) : "#";
  const downloadPdf = () => {
    if (!plan) return;
    const pdf = new jsPDF({ unit: "mm", format: "a4", putOnlyUsedFonts: true });
    const margin = 18; const width = 174; let y = 24; let page = 1;
    const footer = () => { pdf.setDrawColor(218, 232, 229); pdf.line(margin, 282, 192, 282); pdf.setFontSize(8); pdf.setTextColor(112, 128, 136); pdf.text("Valigia Perfetta · Itinerario Express", margin, 288); pdf.text(`Pagina ${page}`, 174, 288); };
    const ensureSpace = (height: number) => { if (y + height > 276) { footer(); pdf.addPage(); page += 1; y = 22; } };
    const sectionTitle = (title: string) => { ensureSpace(12); pdf.setFillColor(232, 248, 241); pdf.roundedRect(margin, y - 6, width, 9, 2, 2, "F"); pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.setTextColor(15, 108, 120); pdf.text(title, margin + 4, y); y += 12; };
    pdf.setFillColor(16, 61, 75); pdf.roundedRect(margin, 14, width, 26, 4, 4, "F"); pdf.setFont("helvetica", "bold"); pdf.setFontSize(20); pdf.setTextColor(255, 255, 255); pdf.text("Valigia Perfetta", margin + 6, 26); pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.text(`Itinerario Express · ${plan.destination}`, margin + 6, 34); y = 52;
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(35, 53, 62); pdf.text(`${readableDate(plan.startDate)} – ${readableDate(plan.endDate)} · ${plan.duration} giorni`, margin, y); y += 5; pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(83, 99, 107); pdf.text(`${plan.luggage} · ${plan.traveler}`, margin, y + 1); y += 13;
    sectionTitle("Lista della valigia");
    plan.categories.forEach((category) => { ensureSpace(12); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(34, 55, 64); pdf.text(category.title, margin, y); y += 5; category.items.forEach((item) => { const lines = pdf.splitTextToSize(`${done[item] ? "✓" : "□"} ${item}`, width - 8) as string[]; ensureSpace(lines.length * 4.5 + 1); pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); pdf.setTextColor(68, 84, 91); pdf.text(lines, margin + 3, y); y += lines.length * 4.5 + 1; }); y += 4; });
    sectionTitle("Itinerario");
    plan.itinerary.forEach((day) => { ensureSpace(29); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.setTextColor(16, 61, 75); pdf.text(`Giorno ${day.day} · ${readableDate(day.date)}`, margin, y); y += 5; [["Mattina", day.morning], ["Pomeriggio", day.afternoon], ["Sera", day.evening]].forEach(([label, text]) => { const lines = pdf.splitTextToSize(`${label}: ${text}`, width - 6) as string[]; ensureSpace(lines.length * 4.3 + 1); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.8); pdf.setTextColor(68, 84, 91); pdf.text(lines, margin + 3, y); y += lines.length * 4.3 + 1; }); y += 4; });
    footer(); pdf.save(`valigia-perfetta-${plan.destination.toLowerCase().replace(/\s+/g, "-")}.pdf`);
  };
  const addChecklistItem = () => { const item = newItem.trim(); if (!item || !plan) return; setPlan({ ...plan, categories: plan.categories.map((category) => category.title === "Extra" ? { ...category, items: [...category.items, item] } : category) }); setNewItem(""); };
  const removeChecklistItem = (categoryTitle: string, item: string) => { if (!plan) return; setPlan({ ...plan, categories: plan.categories.map((category) => category.title === categoryTitle ? { ...category, items: category.items.filter((value) => value !== item) } : category) }); setDone((current) => { const next = { ...current }; delete next[item]; return next; }); };
  const downloadICS = () => { if (!plan) return; const blob = new Blob([buildICS(plan)], { type: "text/calendar;charset=utf-8" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `itinerario-${plan.destination.toLowerCase().replace(/\s+/g, "-")}.ics`; link.click(); URL.revokeObjectURL(link.href); };
  const enableWeatherNotifications = async () => { if (!("Notification" in window)) { setNotificationMessage("Questo browser non supporta le notifiche push."); return; } const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission; if (permission !== "granted") { setNotificationMessage("Notifiche non attivate: puoi abilitarle dalle impostazioni del browser."); return; } setWeatherNotifications(true); setNotificationMessage("Notifiche meteo attivate per questo viaggio."); new Notification("Notifiche meteo attive", { body: `Ti avviseremo se cambiano le previsioni per ${plan?.destination ?? "il tuo viaggio"}.` }); };
  const disableWeatherNotifications = () => { setWeatherNotifications(false); setNotificationMessage("Notifiche meteo disattivate."); };
  const addContactFiles = async (incomingFiles: File[]) => {
    setContactError("");
    const remainingSlots = MAX_CONTACT_ATTACHMENTS - contactAttachments.length;
    if (remainingSlots <= 0) { setContactError("Puoi allegare al massimo 5 immagini per invio."); return; }
    const files = incomingFiles.slice(0, remainingSlots);
    if (incomingFiles.length > remainingSlots) setContactError("Puoi allegare al massimo 5 immagini per invio.");
    const invalid = files.find((file) => !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024);
    if (invalid) { setContactError("Ogni allegato deve essere un’immagine valida di massimo 5 MB."); return; }
    if (contactAttachments.reduce((total, attachment) => total + attachment.file.size, 0) + files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) { setContactError("Il peso totale degli allegati supera il limite massimo di 25 MB."); return; }
    setContactCompressing(true);
    const compressed = await Promise.all(files.map(async (file) => { const compressedFile = await compressContactImage(file); return { file: compressedFile, originalBytes: file.size, compressionPercent: Math.max(0, Math.round((1 - compressedFile.size / file.size) * 100)) }; }));
    setContactAttachments((current) => [...current, ...compressed].slice(0, MAX_CONTACT_ATTACHMENTS));
    setContactCompressing(false);
  };
  const validateContact = () => { const errors = getContactFieldErrors(contactName, contactEmail, contactTopic, contactMessage); setContactFieldErrors(errors); return Object.keys(errors).length === 0; };
  const submitContact = async (event: FormEvent) => { event.preventDefault(); setContactError(""); if (!validateContact()) { setContactSent(false); return; } const lastSubmit = Number(window.localStorage.getItem(CONTACT_COOLDOWN_STORAGE_KEY) ?? "0"); const remaining = 60_000 - (Date.now() - lastSubmit); if (remaining > 0) { setContactCooldownSeconds(Math.ceil(remaining / 1000)); setContactError(`Attendi ${Math.ceil(remaining / 1000)} secondi prima di inviare un’altra richiesta.`); setContactSent(false); return; } if (contactAttachments.some(({ file }) => !file.type.startsWith("image/") || file.size > 5 * 1024 * 1024)) { setContactError("Ogni allegato deve essere un’immagine valida di massimo 5 MB."); setContactSent(false); return; } setContactSubmitting(true); setContactVerifyingCaptcha(true); try { const token = await getRecaptchaToken(); const verification = await fetch("/api/recaptcha/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }); const verificationResult = await verification.json() as { ok?: boolean; message?: string }; if (!verification.ok || !verificationResult.ok) throw new Error(verificationResult.message ?? "Verifica reCAPTCHA non superata."); setContactVerifyingCaptcha(false); const formData = new FormData(); formData.append("name", contactName.trim()); formData.append("email", contactEmail.trim()); formData.append("topic", contactTopic); formData.append("message", contactMessage.trim()); formData.append("_subject", `[${contactTopic}] Nuova richiesta · Valigia Perfetta & Itinerario Express`); formData.append("_captcha", "false"); formData.append("_template", "table"); contactAttachments.forEach(({ file }) => formData.append("attachment", file, file.name)); const response = await fetch("https://formsubmit.co/ajax/suitecase.express@gmail.com", { method: "POST", headers: { Accept: "application/json" }, body: formData }); if (!response.ok) throw new Error("Invio non riuscito"); window.localStorage.setItem(CONTACT_COOLDOWN_STORAGE_KEY, String(Date.now())); setContactCooldownSeconds(60); setContactSent(true); setContactName(""); setContactEmail(""); setContactTopic(""); setContactMessage(""); setContactAttachments([]); setContactFieldErrors({}); contactCloseTimer.current = window.setTimeout(() => { setContactOpen(false); setContactSent(false); }, 2000); } catch (error) { const message = error instanceof Error ? error.message : ""; if (message.includes("Attendi")) { setContactCooldownSeconds(60); setContactError(message); } else if (message.toLowerCase().includes("recaptcha") || message.toLowerCase().includes("anti-spam")) { setContactError("La verifica reCAPTCHA non è andata a buon fine. Riprova tra poco."); } else { setContactError("Si è verificato un errore. Riprova tra poco."); } setContactSent(false); } finally { setContactVerifyingCaptcha(false); setContactSubmitting(false); } };

  return <div className="min-h-screen overflow-x-hidden bg-[#f8fbfa] text-slate-900">
    <header className="container flex items-center justify-between py-5 sm:py-7"><div className="flex items-center gap-3"><div className="brand-mark"><Plane className="size-5" /></div><div><p className="font-display text-lg font-black leading-none tracking-tight">Valigia Perfetta</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Itinerario Express</p></div></div><div className="flex items-center gap-2"><div className="hidden items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm sm:flex"><ShieldCheck className="size-3.5 text-emerald-600" /> Pronto in 60 secondi</div><button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={theme === "dark" ? "Attiva modalità chiara" : "Attiva modalità scura"} title={theme === "dark" ? "Modalità chiara" : "Modalità scura"}>{theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}<span className="hidden sm:inline">{theme === "dark" ? "Chiaro" : "Scuro"}</span></button></div></header>
    <main className="container pb-16">
      <section className="hero-grid"><div className="hero-copy"><div className="eyebrow"><Sparkles className="size-4" /> Il tuo copilota di viaggio</div><h1 className="mt-4 max-w-3xl font-display text-5xl font-black leading-[0.98] tracking-[-0.045em] text-slate-950 sm:text-7xl">Parti leggero.<br /><span className="text-emerald-600">Vivi di più.</span></h1><p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Una checklist senza dimenticanze e un itinerario che sa già dove vuoi andare. Inserisci le date, al resto pensiamo noi.</p><div className="mt-7 flex flex-wrap gap-3 text-sm font-semibold text-slate-600"><span className="hero-chip"><Luggage className="size-4 text-emerald-600" /> Valigia su misura</span><span className="hero-chip"><MapPin className="size-4 text-sky-600" /> Tappe smart</span><span className="hero-chip"><ShieldCheck className="size-4 text-emerald-600" /> Niente stress</span></div></div><div className="hero-orbit"><div className="orbit-card orbit-card-top"><SunMedium className="size-4 text-amber-500" /><span>Il meteo, considerato</span></div><div className="suitcase-illustration"><div className="suitcase-handle" /><div className="suitcase-body"><div className="suitcase-line" /><div className="suitcase-sticker">✦</div><div className="suitcase-wheel wheel-left" /><div className="suitcase-wheel wheel-right" /></div></div><div className="orbit-card orbit-card-bottom"><CheckCircle2 className="size-4 text-emerald-600" /><span>Ogni cosa al suo posto</span></div></div></section>
      <section className="safety-alert" aria-label="Sicurezza e documenti"><div className="safety-alert-title"><AlertTriangle className="size-5" /> Prima di partire, controlla</div><div className="safety-items"><span>✓ Validità documento: almeno 6 mesi</span><span>✓ Check-in online per evitare penali</span><span>✓ Tessera Sanitaria Europea o assicurazione</span></div></section>
      <section className="form-card" aria-label="Dati del viaggio"><div className="section-kicker"><span className="step-number">01</span><div><p className="eyebrow text-emerald-700">Partiamo da te</p><h2 className="font-display text-2xl font-black tracking-tight sm:text-3xl">Raccontaci il viaggio</h2></div></div><form onSubmit={generate} className="mt-7 grid gap-5 lg:grid-cols-12"><label className="field lg:col-span-4"><span>Destinazione</span><div className="input-wrap"><MapPin className="size-5 text-emerald-600" /><input required value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Es. Lisbona, Kyoto, Puglia…" /></div></label><label className="field lg:col-span-2"><span>Partenza</span><div className="input-wrap"><CalendarDays className="size-4 text-slate-400" /><input required type="date" value={startDate} min={tomorrow} max={addDays(tomorrow, 15)} onChange={(event) => { setStartDate(event.target.value); if (event.target.value > endDate) setEndDate(addDays(event.target.value, 1)); }} /></div></label><label className="field lg:col-span-2"><span>Ritorno</span><div className="input-wrap"><CalendarDays className="size-4 text-slate-400" /><input required type="date" value={endDate} min={addDays(startDate, 1)} max={addDays(startDate, 15)} onChange={(event) => setEndDate(event.target.value)} /></div></label><label className="field lg:col-span-2"><span>Tipo bagaglio</span><div className="select-wrap"><Luggage className="size-4 text-slate-400" /><select value={luggage} onChange={(event) => setLuggage(event.target.value as Luggage)}>{luggageOptions.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none size-4 text-slate-400" /></div></label><label className="field lg:col-span-2"><span>Chi viaggia?</span><div className="select-wrap"><Users className="size-4 text-slate-400" /><select value={traveler} onChange={(event) => setTraveler(event.target.value as Traveler)}>{travelerOptions.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none size-4 text-slate-400" /></div></label><div className="lg:col-span-12"><Button type="submit" disabled={isGenerating} className="generate-btn w-full"><Sparkles className={`size-5 ${isGenerating ? "animate-pulse" : ""}`} /> {isGenerating ? "Creo il tuo piano…" : "Genera Valigia & Itinerario"} {!isGenerating && <ArrowRight className="size-4" />}</Button></div></form><p className="mt-3 text-xs text-slate-400">Previsioni disponibili fino a 16 giorni dalla partenza.</p></section>
      {plan && <div id="preview" className={`result-area ${isGenerating ? "is-generating" : ""}`} aria-busy={isGenerating}><GenerationSkeleton progress={generationProgress} /><div className="result-heading"><div><div className="eyebrow text-emerald-700"><CheckCircle2 className="size-4" /> Piano pronto per te</div><h2 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">{plan.destination}, arriviamo.</h2><p className="mt-2 text-slate-500">{readableDate(plan.startDate)} – {readableDate(plan.endDate)} · {plan.duration} giorni · {plan.luggage} · {plan.traveler}</p></div>{unlocked && <Button variant="outline" onClick={() => { setPlan(null); setDestination(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-full border-slate-200 bg-white"><RotateCcw className="size-4" /> Nuovo viaggio</Button>}</div>
        {weatherLoading && <div className="weather-loading"><SunMedium className="size-4 animate-spin" /> Recupero il meteo per personalizzare la valigia…</div>}
        {weatherError && <div className="weather-error"><CloudRain className="size-4" /> {weatherError} La checklist resta disponibile con suggerimenti base.</div>}
        {plan.weather && <div className="weather-widget"><div><p className="eyebrow text-emerald-700"><ThermometerSun className="size-4" /> Meteo previsto · {plan.weather.city}</p><p className="mt-1 text-sm text-slate-500">{plan.weather.rainy ? "Possibili piogge: abbiamo aggiunto una protezione." : plan.weather.sunny ? "Giornate luminose: crema solare in valigia." : "Clima variabile: strati leggeri consigliati."}</p><button type="button" role="switch" aria-checked={weatherNotifications} aria-label={weatherNotifications ? "Disattiva notifiche meteo" : "Attiva notifiche meteo"} className={`weather-notification-button ${weatherNotifications ? "is-active" : ""}`} onClick={weatherNotifications ? disableWeatherNotifications : enableWeatherNotifications}><span className="notification-switch-track"><span className="notification-switch-thumb" /></span><Bell className="size-4" /> <span>{weatherNotifications ? "Notifiche attive" : "Notifiche meteo"}</span></button>{notificationMessage && <p className="notification-message" role="status">{notificationMessage}</p>}</div><div className="weather-days">{plan.weather.days.slice(0, 4).map((day) => <div key={day.date} className="weather-day"><span>{readableDate(day.date)}</span><strong>{weatherEmoji(day.code)}</strong><b>{day.max}°</b><small>{weatherLabel(day.code)}</small></div>)}</div></div>}
        <DestinationMap plan={plan} />
        {!unlocked ? <><div className="preview-grid"><div className="preview-panel"><div className="panel-heading"><span className="panel-icon"><Luggage className="size-5" /></span><div><p className="eyebrow text-slate-500">Anteprima</p><h3 className="font-display text-xl font-black">Cosa finisce in valigia</h3></div></div><div className="mt-5 space-y-3">{allItems.slice(0, 3).map((item) => <div key={item} className="preview-item"><span className="preview-check"><Check className="size-3.5" /></span>{item}</div>)}<div className="blur-stack"><div>Adattatore universale e power bank</div><div>Crema solare e kit farmaci</div><div>Extra pensati per chi viaggia con te</div></div></div></div><div className="preview-panel itinerary-preview"><div className="panel-heading"><span className="panel-icon panel-icon-blue"><CalendarDays className="size-5" /></span><div><p className="eyebrow text-slate-500">Giorno 01</p><h3 className="font-display text-xl font-black">Il ritmo della tua giornata</h3></div></div><div className="mt-5 rounded-2xl bg-[#eaf8f3] p-4"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">Mattina</p><p className="mt-2 font-semibold leading-6 text-slate-800">{plan.itinerary[0].morning}</p></div><div className="blur-stack mt-3"><div>Pomeriggio · esperienza locale</div><div>Sera · cena tipica e passeggiata</div></div></div></div><Paywall plan={plan} onPaid={() => setUnlocked(true)} /></> : <div className="unlocked-layout"><div className="success-banner"><div className="success-icon"><CheckCircle2 className="size-6" /></div><div><p className="font-display text-xl font-black">Piano sbloccato. Buon viaggio!</p><p className="mt-1 text-sm text-emerald-800/80">Spunta le cose mentre prepari la valigia e porta il piano con te.</p></div><div className="ml-auto hidden rounded-full bg-white/80 px-3 py-2 text-sm font-bold text-emerald-700 sm:block">{doneCount}/{allItems.length} pronti</div></div><div className="action-row"><p className="text-sm text-slate-500"><span className="font-bold text-slate-800">{doneCount}</span> di {allItems.length} oggetti pronti</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={copyReport} className="rounded-full border-slate-200 bg-white"><Copy className="size-4" /> Copia Resoconto</Button><Button onClick={downloadPdf} className="rounded-full bg-slate-950 text-white hover:bg-slate-800"><Download className="size-4" /> Scarica PDF</Button><Button onClick={downloadICS} className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700"><CalendarDays className="size-4" /> Calendario .ICS</Button><a href={calendarUrl} target="_blank" rel="noopener noreferrer" className="calendar-google-button"><CalendarPlus className="size-4" /> Google Calendar</a><span className="share-label">Condividi</span><Button type="button" onClick={shareItinerary} className="share-button native-share"><Share2 className="size-4" /> Condividi</Button><a href={whatsappShareUrl} target="_blank" rel="noopener noreferrer" className="share-button whatsapp" aria-label="Condividi su WhatsApp"><MessageCircle className="size-4" /> WhatsApp</a><a href={telegramShareUrl} target="_blank" rel="noopener noreferrer" className="share-button telegram" aria-label="Condividi su Telegram"><Send className="size-4" /> Telegram</a></div></div>{notice && <div className="notice"><CheckCircle2 className="size-4" /> {notice}</div>}<div className="unlocked-grid"><div className="checklist-column"><div className="panel-heading mb-5"><span className="panel-icon"><ClipboardCheck className="size-5" /></span><div><p className="eyebrow text-slate-500">Checklist interattiva</p><h3 className="font-display text-2xl font-black">Prepara con calma</h3></div></div>{plan.categories.map((category) => <div key={category.title} className="category-card"><div className="flex items-center gap-3"><IconBadge icon={category.icon} /><div><h4 className="font-display text-lg font-black">{category.title}</h4><p className="text-xs text-slate-400">{category.items.length} elementi</p></div></div><div className="mt-4 space-y-3">{category.items.map((item) => <div key={`${category.title}-${item}`} className="check-row-wrap"><label className={`check-row ${done[item] ? "is-done" : ""}`}><Checkbox checked={Boolean(done[item])} onCheckedChange={(checked) => setDone((current) => ({ ...current, [item]: Boolean(checked) }))} /><span>{item}</span></label><button type="button" aria-label={`Rimuovi ${item}`} className="delete-item" onClick={() => removeChecklistItem(category.title, item)}><Trash2 className="size-4" /></button></div>)}</div>{category.title === "Extra" && <div className="add-item-row"><input value={newItem} onChange={(event) => setNewItem(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addChecklistItem(); } }} placeholder="Aggiungi un oggetto personale" /><Button type="button" onClick={addChecklistItem} className="rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"><Plus className="size-4" /> Aggiungi</Button></div>}</div>)}</div><div className="itinerary-column"><div className="panel-heading mb-5"><span className="panel-icon panel-icon-blue"><MapPin className="size-5" /></span><div><p className="eyebrow text-slate-500">Itinerario Express</p><h3 className="font-display text-2xl font-black">Giorno dopo giorno</h3></div></div>{plan.itinerary.map((day) => <div key={day.day} className="day-card"><div className="day-number">{String(day.day).padStart(2, "0")}</div><div className="flex-1"><p className="eyebrow text-emerald-700">Giorno {day.day} · {readableDate(day.date)}</p><div className="timeline"><div><span className="timeline-label">Mattina</span><p>{day.morning}</p></div><div><span className="timeline-label">Pomeriggio</span><p>{day.afternoon}</p></div><div><span className="timeline-label">Sera</span><p>{day.evening}</p></div></div></div></div>)}<section className="insights-card"><div className="eyebrow text-emerald-700"><Utensils className="size-4" /> Food, trappole & valuta</div><div className="insights-grid"><div><h4>Da assaggiare</h4><ul>{plan.insights.dishes.map((dish) => <li key={dish}>• {dish}</li>)}</ul></div><div><h4>Attenzione alle trappole</h4><p>{plan.insights.traps}</p></div><div><h4><Coins className="inline size-4" /> Valuta e mance</h4><p>{plan.insights.currency}</p><p className="mt-2 text-xs text-slate-500">{plan.insights.tips}</p></div></div></section></div></div><section className="bonus-card" aria-labelledby="bonus-viaggio-title"><div className="bonus-card-header"><span className="bonus-icon">🎁</span><div><p className="eyebrow text-sky-700">Bonus Viaggio</p><h3 id="bonus-viaggio-title" className="font-display text-2xl font-black tracking-tight text-slate-950">🎁 Vuoi 80 € GRATIS da spendere per questo viaggio?</h3></div></div><p className="bonus-description">Apri il conto gratuito Buddybank (by UniCredit), usa il codice invito e fai una spesa di almeno 10 €. Riceverai 80 € di bonus immediato sul conto!</p><ol className="bonus-steps"><li>Scarica l’app Buddybank e inizia la registrazione.</li><li>Inserisci il codice promozionale qui sotto.</li><li>Fai un acquisto di almeno 10 € (es. un biglietto, un pranzo o la benzina per il viaggio) e ottieni i tuoi 80 €!</li></ol><div className="bonus-code-row"><code>{BUDDYBANK_INVITE_CODE}</code><button type="button" className="bonus-copy-button" onClick={copyBuddybankCode}>{bonusCopied ? "Copiato! ✅" : "Copia Codice 📋"}</button></div><a className="bonus-action" href="https://www.buddybank.com/" target="_blank" rel="noopener noreferrer">Apri Buddybank e Riscatta 80 € 🚀 <ArrowRight className="size-4" /></a><p className="bonus-disclaimer">Promozione soggetta ai termini e alle condizioni applicabili di Buddybank/UniCredit.</p></section></div>}
      </div>}
    </main>
    <footer className="container flex flex-col gap-3 border-t border-slate-200/80 py-7 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between"><p>Valigia Perfetta · Progettato per partire più sereni.</p><p className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-emerald-600" /> Pagamenti protetti da Stripe</p></footer>
    {!contactOpen && <button type="button" className="contact-fab" aria-label="Apri contatti" onClick={() => setContactOpen(true)}><Mail className="size-5" /><span>Contatti</span></button>}
    {contactOpen && <div className="contact-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setContactOpen(false); }}><section className="contact-modal" role="dialog" aria-modal="true" aria-labelledby="contact-title"><button type="button" className="contact-close" aria-label="Chiudi contatti" onClick={() => setContactOpen(false)}><X className="size-5" /></button><div className="contact-icon"><Mail className="size-6" /></div><p className="eyebrow text-emerald-700">Siamo qui per aiutarti</p><h2 id="contact-title" className="mt-2 font-display text-2xl font-black tracking-tight text-slate-950">Hai bisogno di aiuto?</h2>{contactSent ? <div className="contact-success contact-success-animated"><div className="contact-success-check"><CheckCircle2 className="size-6" /></div><div><strong>Messaggio inviato!</strong><p>Ti risponderemo il prima possibile. ✅</p></div></div> : <><p className="mt-2 text-sm leading-6 text-slate-600">Compila il form: controlleremo i dati prima dell’invio diretto.</p><form className="contact-form" onSubmit={submitContact} noValidate><label>Nome<input aria-invalid={Boolean(contactFieldErrors.name)} required value={contactName} onChange={(event) => { setContactName(event.target.value); setContactFieldErrors((current) => ({ ...current, name: undefined })); }} onBlur={validateContact} placeholder="Il tuo nome" />{contactFieldErrors.name && <span className="contact-field-error">{contactFieldErrors.name}</span>}</label><label>Email<input aria-invalid={Boolean(contactFieldErrors.email)} required type="email" value={contactEmail} onChange={(event) => { setContactEmail(event.target.value); setContactFieldErrors((current) => ({ ...current, email: undefined })); }} onBlur={validateContact} placeholder="nome@esempio.it" />{contactFieldErrors.email && <span className="contact-field-error">{contactFieldErrors.email}</span>}</label><label>Argomento<select aria-invalid={Boolean(contactFieldErrors.topic)} required value={contactTopic} onChange={(event) => { setContactTopic(event.target.value); setContactFieldErrors((current) => ({ ...current, topic: undefined })); }} onBlur={validateContact}><option value="">Seleziona un argomento</option>{contactTopics.map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select>{contactFieldErrors.topic && <span className="contact-field-error">{contactFieldErrors.topic}</span>}</label><label>Messaggio<textarea aria-invalid={Boolean(contactFieldErrors.message)} required rows={4} value={contactMessage} onChange={(event) => { setContactMessage(event.target.value); setContactFieldErrors((current) => ({ ...current, message: undefined })); }} onBlur={validateContact} placeholder="Come possiamo aiutarti?" />{contactFieldErrors.message && <span className="contact-field-error">{contactFieldErrors.message}</span>}</label><label>Allega immagini o screenshot (facoltativo)<div className={`contact-dropzone ${contactDragActive ? "is-dragging" : ""} ${contactAttachments.length >= 5 ? "is-full" : ""}`} onDragEnter={(event) => { event.preventDefault(); setContactDragActive(true); }} onDragOver={(event) => { event.preventDefault(); setContactDragActive(true); }} onDragLeave={(event) => { event.preventDefault(); setContactDragActive(false); }} onDrop={(event) => { event.preventDefault(); setContactDragActive(false); void addContactFiles(Array.from(event.dataTransfer.files)); }}><input type="file" accept="image/*" multiple disabled={contactCompressing || contactAttachments.length >= 5} onChange={(event) => { void addContactFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} /><span className="contact-dropzone-icon">↥</span><strong>{contactAttachments.length >= 5 ? "Limite di 5 immagini raggiunto" : "Trascina qui le immagini"}</strong><span>oppure clicca per selezionarle · {contactAttachments.length}/5</span></div>{contactCompressing && <span className="contact-attachment-help">Compressione immagini in corso…</span>}{contactAttachments.map((attachment, index) => <span className="contact-attachment-selected" key={`${attachment.file.name}-${attachment.file.lastModified}-${index}`}><span>{attachment.file.name} · {(attachment.file.size / 1024 / 1024).toFixed(2)} MB {attachment.compressionPercent > 0 ? <strong>· risparmio {attachment.compressionPercent}%</strong> : <em>· già ottimizzata</em>}</span><button type="button" onClick={() => setContactAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Rimuovi ${attachment.file.name}`}>Rimuovi</button></span>)}<div className={`contact-attachment-progress ${contactAttachments.reduce((total, attachment) => total + attachment.file.size, 0) >= MAX_TOTAL_ATTACHMENT_BYTES ? "is-full" : contactAttachments.reduce((total, attachment) => total + attachment.file.size, 0) > 20 * 1024 * 1024 ? "is-warning" : ""}`} aria-label="Spazio allegati utilizzato"><div className="contact-attachment-progress-track"><span style={{ width: `${Math.min(100, (contactAttachments.reduce((total, attachment) => total + attachment.file.size, 0) / MAX_TOTAL_ATTACHMENT_BYTES) * 100)}%` }} /></div><span className="contact-attachment-progress-label">{(contactAttachments.reduce((total, attachment) => total + attachment.file.size, 0) / 1024 / 1024).toFixed(2)} MB / 25 MB · {Math.min(100, Math.round((contactAttachments.reduce((total, attachment) => total + attachment.file.size, 0) / MAX_TOTAL_ATTACHMENT_BYTES) * 100))}%</span></div><span className="contact-attachment-remaining">Spazio disponibile: {Math.max(0, (MAX_TOTAL_ATTACHMENT_BYTES - contactAttachments.reduce((total, attachment) => total + attachment.file.size, 0)) / 1024 / 1024).toFixed(2)} MB</span>{contactAttachments.reduce((total, attachment) => total + attachment.file.size, 0) >= MAX_TOTAL_ATTACHMENT_BYTES ? <span className="contact-attachment-limit-error" role="alert">Limite raggiunto: gli allegati superano il peso massimo consentito di 25 MB. Rimuovi un file per poter continuare.</span> : contactAttachments.reduce((total, attachment) => total + attachment.file.size, 0) > 20 * 1024 * 1024 && <span className="contact-attachment-warning" role="status">Stai utilizzando più di 20 MB. Riduci o rimuovi un allegato prima di raggiungere il limite.</span>}<span className="contact-attachment-help">Massimo 5 immagini · PNG, JPG o GIF · massimo 5 MB ciascuna · gli screenshot grandi vengono compressi automaticamente</span></label>{contactError && <p className="contact-form-error" role="alert">{contactError}</p>}{contactCooldownSeconds > 0 && !contactSubmitting && <p className="contact-cooldown" role="status">Potrai inviare un nuovo messaggio tra <strong>{contactCooldownSeconds} secondi</strong>.</p>}<button className="contact-email" type="submit" disabled={contactSubmitting || contactCooldownSeconds > 0 || contactAttachments.reduce((total, attachment) => total + attachment.file.size, 0) >= MAX_TOTAL_ATTACHMENT_BYTES}><Loader2 className={`size-4 ${contactSubmitting ? "animate-spin" : ""}`} /> {contactVerifyingCaptcha ? "Verifica reCAPTCHA..." : contactSubmitting ? "Invio in corso..." : contactCooldownSeconds > 0 ? `Riprova tra ${contactCooldownSeconds}s` : "Invia Messaggio"} {!contactSubmitting && contactCooldownSeconds === 0 && <ArrowRight className="ml-auto size-4" />}</button></form></>}<p className="mt-3 text-center text-xs text-slate-400">suitecase.express@gmail.com</p></section></div>}
  </div>;
}
