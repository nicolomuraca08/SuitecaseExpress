import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { jsPDF } from "jspdf";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Copy,
  CreditCard,
  Download,
  FileText,
  Luggage,
  LockKeyhole,
  MapPin,
  Plane,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Ticket,
  Users,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";

type Month = "Gennaio" | "Febbraio" | "Marzo" | "Aprile" | "Maggio" | "Giugno" | "Luglio" | "Agosto" | "Settembre" | "Ottobre" | "Novembre" | "Dicembre";
type Luggage = "Solo Zaino" | "Trolley 10kg" | "Stiva";
type Traveler = "Da solo/a" | "Coppia" | "Bambini" | "Amici";
type ChecklistCategory = { title: string; icon: string; items: string[] };
type TripDay = { day: number; morning: string; afternoon: string; evening: string };
type TravelPlan = { destination: string; month: Month; duration: number; luggage: Luggage; traveler: Traveler; categories: ChecklistCategory[]; itinerary: TripDay[] };

const months: Month[] = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
const luggageOptions: Luggage[] = ["Solo Zaino", "Trolley 10kg", "Stiva"];
const travelerOptions: Traveler[] = ["Da solo/a", "Coppia", "Bambini", "Amici"];

const publicKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = publicKey ? loadStripe(publicKey) : null;

export function buildPlan(destination: string, month: Month, duration: number, luggage: Luggage, traveler: Traveler): TravelPlan {
  const place = destination.trim().replace(/\s+/g, " ");
  const climate: Record<Month, string> = {
    Gennaio: "freddo e variabile", Febbraio: "fresco, con possibili piogge", Marzo: "mite e variabile", Aprile: "mite e luminoso",
    Maggio: "caldo ma piacevole", Giugno: "caldo e soleggiato", Luglio: "caldo e secco", Agosto: "caldo e vivace",
    Settembre: "ancora caldo, con serate miti", Ottobre: "mite e autunnale", Novembre: "fresco e piovoso", Dicembre: "freddo e festivo",
  };
  const extraByTraveler: Record<Traveler, string[]> = {
    "Da solo/a": ["Lucchetto TSA", "Mini taccuino di viaggio"],
    Coppia: ["Adattatore doppio", "Borsa pieghevole condivisa"],
    Bambini: ["Snack e borraccia per bambini", "Cambio completo di riserva", "Piccolo kit intrattenimento"],
    Amici: ["Power bank condiviso", "Giochi da viaggio", "Borraccia riutilizzabile"],
  };
  const clothingCount = Math.min(6, Math.max(3, Math.ceil(duration / 2) + 2));
  const clothes = [
    `${clothingCount} cambi leggeri adatti al clima ${climate[month]}`,
    "1 giacca leggera o strato caldo",
    "Biancheria e calze per ogni giorno + 1 extra",
    "Scarpe comode per camminare",
    "Pigiama e costume da bagno",
  ];
  if (luggage === "Solo Zaino") clothes.push("Sacca organizer comprimibile");
  if (luggage === "Stiva") clothes.push("Secondo paio di scarpe in custodia");

  const categories: ChecklistCategory[] = [
    { title: "Documenti", icon: "ticket", items: ["Documento d’identità valido", "Biglietti e prenotazioni offline", "Assicurazione viaggio", "Carta e un po’ di contanti"] },
    { title: "Abiti", icon: "shirt", items: clothes },
    { title: "Elettronica", icon: "bolt", items: ["Smartphone + caricatore", "Power bank", "Adattatore universale", "Auricolari"] },
    { title: "Beauty", icon: "drop", items: ["Spazzolino e dentifricio formato viaggio", "Crema solare SPF 30+", "Mini kit farmaci personali", "Gel igienizzante"] },
    { title: "Extra", icon: "sparkle", items: [...extraByTraveler[traveler], "Borraccia vuota per i controlli"] },
  ];

  const itinerary: TripDay[] = Array.from({ length: duration }, (_, index) => {
    const day = index + 1;
    const focus = day === 1 ? "il centro storico" : day === duration ? "il quartiere più autentico" : `una zona speciale di ${place}`;
    return {
      day,
      morning: day === 1 ? `Passeggiata di orientamento tra i simboli di ${place}` : `Colazione lenta e scoperta di ${focus}`,
      afternoon: day === duration ? `Ultime botteghe, panorama e acquisti ricordo a ${place}` : `Esperienza locale: mercato, museo o sapore tipico di ${place}`,
      evening: traveler === "Bambini" ? "Cena presto in un posto easy, poi rientro senza fretta" : `Aperitivo panoramico e cena tipica a ${place}`,
    };
  });

  return { destination: place, month, duration, luggage, traveler, categories, itinerary };
}

function IconBadge({ icon }: { icon: string }) {
  const icons: Record<string, ReactNode> = {
    ticket: <Ticket className="size-5" />, shirt: <Luggage className="size-5" />, bolt: <WalletCards className="size-5" />,
    drop: <ShieldCheck className="size-5" />, sparkle: <Sparkles className="size-5" />,
  };
  return <span className="category-icon">{icons[icon]}</span>;
}

function StripeCheckoutForm({ onPaid }: { onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState("");

  const submitPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;
    setIsPaying(true);
    setError("");
    const result = await stripe.confirmPayment({ elements, redirect: "if_required" });
    if (result.error) setError(result.error.message ?? "Controlla i dati della carta e riprova.");
    else if (result.paymentIntent?.status === "succeeded") onPaid();
    else setError(`Pagamento non ancora completato (${result.paymentIntent?.status ?? "stato sconosciuto"}).`);
    setIsPaying(false);
  };

  return (
    <form onSubmit={submitPayment} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <Button type="submit" disabled={!stripe || isPaying} className="w-full rounded-2xl bg-emerald-600 py-6 text-base font-bold text-white shadow-lg shadow-emerald-900/10 hover:bg-emerald-700">
        <LockKeyhole className="size-4" /> {isPaying ? "Verifica in corso…" : "Sblocca il mio piano · 3,99 €"}
      </Button>
      <p className="flex items-center justify-center gap-2 text-center text-xs text-slate-500"><ShieldCheck className="size-3.5 text-emerald-600" /> Pagamento sicuro con Stripe. Nessun dato carta viene salvato.</p>
    </form>
  );
}

function Paywall({ plan, onPaid }: { plan: TravelPlan; onPaid: () => void }) {
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const createIntent = trpc.payment.createIntent.useMutation({ onSuccess: ({ clientSecret: secret }) => setClientSecret(secret), onError: (err) => setError(err.message) });

  const startPayment = () => {
    setError("");
    if (!stripePromise) {
      onPaid();
      return;
    }
    setLoading(true);
    createIntent.mutate({ destination: plan.destination, duration: plan.duration }, { onSettled: () => setLoading(false) });
  };

  return (
    <section className="paywall-card" aria-labelledby="unlock-title">
      <div className="paywall-lock"><LockKeyhole className="size-5" /></div>
      <p className="eyebrow text-emerald-700">Il tuo piano è pronto</p>
      <h2 id="unlock-title" className="mt-2 font-display text-3xl font-black tracking-tight text-slate-950">Una valigia più leggera. Un viaggio più pieno.</h2>
      <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">Sblocca tutte le categorie della checklist e ogni tappa personalizzata per {plan.destination}. L’anteprima ti mostra il metodo; il piano completo resta tutto tuo.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[[<ClipboardCheck className="size-4" />, "Checklist completa"], [<CalendarDays className="size-4" />, `${plan.duration} giorni organizzati`], [<FileText className="size-4" />, "PDF pronto da portare"]].map(([icon, label]) => <div key={label as string} className="benefit-pill">{icon}<span>{label}</span></div>)}
      </div>
      <div className="mt-6 rounded-3xl border border-slate-200 bg-white/80 p-4 sm:p-5">
        {!clientSecret ? (
          <>
            <div className="mb-4 flex items-center justify-between gap-4"><div><p className="font-bold text-slate-900">Sblocco una tantum</p><p className="text-sm text-slate-500">Valigia + itinerario completo</p></div><span className="price-tag">3,99 €</span></div>
            <Button onClick={startPayment} disabled={loading} className="w-full rounded-2xl bg-emerald-600 py-6 text-base font-bold text-white hover:bg-emerald-700">{loading ? "Preparo il pagamento…" : stripePromise ? <><CreditCard className="size-4" /> Continua al pagamento sicuro</> : <><Sparkles className="size-4" /> Sblocca anteprima demo</>} <ArrowRight className="size-4" /></Button>
            {!stripePromise && <p className="mt-3 text-center text-xs text-slate-500">Modalità demo: aggiungi STRIPE_SECRET_KEY e VITE_STRIPE_PUBLISHABLE_KEY per attivare il pagamento reale.</p>}
            {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
          </>
        ) : (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe", variables: { colorPrimary: "#059669", borderRadius: "16px", fontFamily: "Manrope, sans-serif" } } }}><StripeCheckoutForm onPaid={onPaid} /></Elements>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const [destination, setDestination] = useState("");
  const [month, setMonth] = useState<Month>("Maggio");
  const [duration, setDuration] = useState(4);
  const [luggage, setLuggage] = useState<Luggage>("Trolley 10kg");
  const [traveler, setTraveler] = useState<Traveler>("Da solo/a");
  const [plan, setPlan] = useState<TravelPlan | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");

  const allItems = useMemo(() => plan?.categories.flatMap((category) => category.items) ?? [], [plan]);
  const doneCount = allItems.filter((item) => done[item]).length;
  const reportText = plan ? `VALIGIA PERFETTA · ${plan.destination}\n${plan.duration} giorni · ${plan.month} · ${plan.luggage} · ${plan.traveler}\n\nCHECKLIST\n${plan.categories.map((category) => `\n${category.title}\n${category.items.map((item) => `□ ${item}`).join("\n")}`).join("\n")}\n\nITINERARIO\n${plan.itinerary.map((day) => `\nGIORNO ${day.day}\nMattina: ${day.morning}\nPomeriggio: ${day.afternoon}\nSera: ${day.evening}`).join("\n")}` : "";

  const generate = (event: FormEvent) => {
    event.preventDefault();
    if (!destination.trim()) return;
    setPlan(buildPlan(destination, month, duration, luggage, traveler));
    setUnlocked(false);
    setDone({});
    setNotice("");
    setTimeout(() => document.getElementById("preview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  };

  const copyReport = async () => {
    await navigator.clipboard.writeText(reportText);
    setNotice("Resoconto copiato negli appunti.");
    setTimeout(() => setNotice(""), 2400);
  };

  const downloadPdf = () => {
    if (!plan) return;
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const lines = pdf.splitTextToSize(reportText, 170);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text("Valigia Perfetta", 20, 22);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(70, 83, 96);
    pdf.text(`Itinerario Express · ${plan.destination}`, 20, 29);
    pdf.setTextColor(24, 38, 53);
    pdf.setFontSize(10);
    let y = 40;
    lines.forEach((line: string) => { if (y > 278) { pdf.addPage(); y = 20; } pdf.text(line, 20, y); y += 5; });
    pdf.save(`valigia-perfetta-${plan.destination.toLowerCase().replace(/\s+/g, "-")}.pdf`);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f8fbfa] text-slate-900">
      <header className="container flex items-center justify-between py-5 sm:py-7">
        <div className="flex items-center gap-3"><div className="brand-mark"><Plane className="size-5" /></div><div><p className="font-display text-lg font-black leading-none tracking-tight">Valigia Perfetta</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">Itinerario Express</p></div></div>
        <div className="hidden items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm sm:flex"><ShieldCheck className="size-3.5 text-emerald-600" /> Pronto in 60 secondi</div>
      </header>

      <main className="container pb-16">
        <section className="hero-grid">
          <div className="hero-copy"><div className="eyebrow"><Sparkles className="size-4" /> Il tuo copilota di viaggio</div><h1 className="mt-4 max-w-3xl font-display text-5xl font-black leading-[0.98] tracking-[-0.045em] text-slate-950 sm:text-7xl">Parti leggero.<br /><span className="text-emerald-600">Vivi di più.</span></h1><p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Una checklist senza dimenticanze e un itinerario che sa già dove vuoi andare. Inserisci i dettagli, al resto pensiamo noi.</p><div className="mt-7 flex flex-wrap gap-3 text-sm font-semibold text-slate-600"><span className="hero-chip"><Luggage className="size-4 text-emerald-600" /> Valigia su misura</span><span className="hero-chip"><MapPin className="size-4 text-sky-600" /> Tappe smart</span><span className="hero-chip"><ShieldCheck className="size-4 text-emerald-600" /> Niente stress</span></div></div>
          <div className="hero-orbit"><div className="orbit-card orbit-card-top"><SunMedium className="size-4 text-amber-500" /><span>Il meteo, considerato</span></div><div className="suitcase-illustration"><div className="suitcase-handle" /><div className="suitcase-body"><div className="suitcase-line" /><div className="suitcase-sticker">✦</div><div className="suitcase-wheel wheel-left" /><div className="suitcase-wheel wheel-right" /></div></div><div className="orbit-card orbit-card-bottom"><CheckCircle2 className="size-4 text-emerald-600" /><span>Ogni cosa al suo posto</span></div></div>
        </section>

        <section className="form-card" aria-label="Dati del viaggio"><div className="section-kicker"><span className="step-number">01</span><div><p className="eyebrow text-emerald-700">Partiamo da te</p><h2 className="font-display text-2xl font-black tracking-tight sm:text-3xl">Raccontaci il viaggio</h2></div></div><form onSubmit={generate} className="mt-7 grid gap-5 lg:grid-cols-12"><label className="field lg:col-span-6"><span>Destinazione</span><div className="input-wrap"><MapPin className="size-5 text-emerald-600" /><input required value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="Es. Lisbona, Kyoto, Puglia…" /></div></label><label className="field lg:col-span-3"><span>Mese</span><div className="select-wrap"><CalendarDays className="size-4 text-slate-400" /><select value={month} onChange={(event) => setMonth(event.target.value as Month)}>{months.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none size-4 text-slate-400" /></div></label><label className="field lg:col-span-3"><span>Durata <strong>{duration} {duration === 1 ? "giorno" : "giorni"}</strong></span><input className="range" type="range" min="1" max="14" value={duration} onChange={(event) => setDuration(Number(event.target.value))} /><div className="range-labels"><span>1</span><span>14</span></div></label><label className="field lg:col-span-4"><span>Tipo bagaglio</span><div className="select-wrap"><Luggage className="size-4 text-slate-400" /><select value={luggage} onChange={(event) => setLuggage(event.target.value as Luggage)}>{luggageOptions.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none size-4 text-slate-400" /></div></label><label className="field lg:col-span-4"><span>Chi viaggia?</span><div className="select-wrap"><Users className="size-4 text-slate-400" /><select value={traveler} onChange={(event) => setTraveler(event.target.value as Traveler)}>{travelerOptions.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown className="pointer-events-none size-4 text-slate-400" /></div></label><div className="flex items-end lg:col-span-4"><Button type="submit" className="generate-btn w-full"><Sparkles className="size-5" /> Genera Valigia & Itinerario <ArrowRight className="size-4" /></Button></div></form></section>

        {plan && <div id="preview" className="result-area"><div className="result-heading"><div><div className="eyebrow text-emerald-700"><CheckCircle2 className="size-4" /> Piano pronto per te</div><h2 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-4xl">{plan.destination}, arriviamo.</h2><p className="mt-2 text-slate-500">{plan.duration} giorni · {plan.month} · {plan.luggage} · {plan.traveler}</p></div>{unlocked && <Button variant="outline" onClick={() => { setPlan(null); setDestination(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-full border-slate-200 bg-white"><RotateCcw className="size-4" /> Nuovo viaggio</Button>}</div>
          {!unlocked ? <><div className="preview-grid"><div className="preview-panel"><div className="panel-heading"><span className="panel-icon"><Luggage className="size-5" /></span><div><p className="eyebrow text-slate-500">Anteprima</p><h3 className="font-display text-xl font-black">Cosa finisce in valigia</h3></div></div><div className="mt-5 space-y-3">{allItems.slice(0, 3).map((item) => <div key={item} className="preview-item"><span className="preview-check"><Check className="size-3.5" /></span>{item}</div>)}<div className="blur-stack"><div>Adattatore universale e power bank</div><div>Crema solare e kit farmaci</div><div>Extra pensati per chi viaggia con te</div></div></div></div><div className="preview-panel itinerary-preview"><div className="panel-heading"><span className="panel-icon panel-icon-blue"><CalendarDays className="size-5" /></span><div><p className="eyebrow text-slate-500">Giorno 01</p><h3 className="font-display text-xl font-black">Il ritmo della tua giornata</h3></div></div><div className="mt-5 rounded-2xl bg-[#eaf8f3] p-4"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">Mattina</p><p className="mt-2 font-semibold leading-6 text-slate-800">{plan.itinerary[0].morning}</p></div><div className="blur-stack mt-3"><div>Pomeriggio · esperienza locale</div><div>Sera · cena tipica e passeggiata</div></div></div></div><Paywall plan={plan} onPaid={() => setUnlocked(true)} /></> : <div className="unlocked-layout"><div className="success-banner"><div className="success-icon"><CheckCircle2 className="size-6" /></div><div><p className="font-display text-xl font-black">Piano sbloccato. Buon viaggio!</p><p className="mt-1 text-sm text-emerald-800/80">Spunta le cose mentre prepari la valigia e porta il PDF con te.</p></div><div className="ml-auto hidden rounded-full bg-white/80 px-3 py-2 text-sm font-bold text-emerald-700 sm:block">{doneCount}/{allItems.length} pronti</div></div><div className="action-row"><p className="text-sm text-slate-500"><span className="font-bold text-slate-800">{doneCount}</span> di {allItems.length} oggetti pronti</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={copyReport} className="rounded-full border-slate-200 bg-white"><Copy className="size-4" /> Copia Resoconto</Button><Button onClick={downloadPdf} className="rounded-full bg-slate-950 text-white hover:bg-slate-800"><Download className="size-4" /> Scarica PDF</Button></div></div>{notice && <div className="notice"><CheckCircle2 className="size-4" /> {notice}</div>}<div className="unlocked-grid"><div className="checklist-column"><div className="panel-heading mb-5"><span className="panel-icon"><ClipboardCheck className="size-5" /></span><div><p className="eyebrow text-slate-500">Checklist interattiva</p><h3 className="font-display text-2xl font-black">Prepara con calma</h3></div></div>{plan.categories.map((category) => <div key={category.title} className="category-card"><div className="flex items-center gap-3"><IconBadge icon={category.icon} /><div><h4 className="font-display text-lg font-black">{category.title}</h4><p className="text-xs text-slate-400">{category.items.length} elementi</p></div></div><div className="mt-4 space-y-3">{category.items.map((item) => <label key={item} className={`check-row ${done[item] ? "is-done" : ""}`}><Checkbox checked={Boolean(done[item])} onCheckedChange={(checked) => setDone((current) => ({ ...current, [item]: Boolean(checked) }))} /><span>{item}</span></label>)}</div></div>)}</div><div className="itinerary-column"><div className="panel-heading mb-5"><span className="panel-icon panel-icon-blue"><MapPin className="size-5" /></span><div><p className="eyebrow text-slate-500">Itinerario Express</p><h3 className="font-display text-2xl font-black">Giorno dopo giorno</h3></div></div>{plan.itinerary.map((day) => <div key={day.day} className="day-card"><div className="day-number">{String(day.day).padStart(2, "0")}</div><div className="flex-1"><p className="eyebrow text-emerald-700">Giorno {day.day}</p><div className="timeline"><div><span className="timeline-label">Mattina</span><p>{day.morning}</p></div><div><span className="timeline-label">Pomeriggio</span><p>{day.afternoon}</p></div><div><span className="timeline-label">Sera</span><p>{day.evening}</p></div></div></div></div>)}</div></div></div>}
        </div>}
      </main>
      <footer className="container flex flex-col gap-3 border-t border-slate-200/80 py-7 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between"><p>Valigia Perfetta · Progettato per partire più sereni.</p><p className="flex items-center gap-2"><ShieldCheck className="size-3.5 text-emerald-600" /> Pagamenti protetti da Stripe</p></footer>
    </div>
  );
}
