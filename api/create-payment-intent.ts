import Stripe from "stripe";

const PAYMENT_AMOUNT_CENTS = 399;

type VercelRequest = { method?: string; body?: unknown };
type VercelResponse = {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => VercelResponse;
};

type PaymentInput = { destination?: unknown; duration?: unknown };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).setHeader("Allow", "POST").json({ error: "Metodo non consentito." });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(503).json({ error: "Stripe non è ancora configurato." });
  }

  const body = (req.body ?? {}) as PaymentInput;
  const destination = typeof body.destination === "string" ? body.destination.trim() : "";
  const duration = typeof body.duration === "number" ? body.duration : Number(body.duration);
  if (!destination || destination.length > 80 || !Number.isInteger(duration) || duration < 1 || duration > 14) {
    return res.status(400).json({ error: "Destinazione o durata non valide." });
  }

  try {
    const stripe = new Stripe(secretKey);
    const intent = await stripe.paymentIntents.create({
      amount: PAYMENT_AMOUNT_CENTS,
      currency: "eur",
      payment_method_types: ["card"],
      description: "Valigia Perfetta & Itinerario Express",
      metadata: { destination, duration: String(duration), product: "travel-plan-unlock" },
    });
    if (!intent.client_secret) return res.status(500).json({ error: "Stripe non ha restituito un client secret valido." });
    return res.status(200).json({ clientSecret: intent.client_secret });
  } catch {
    return res.status(502).json({ error: "Impossibile preparare il pagamento Stripe." });
  }
}
