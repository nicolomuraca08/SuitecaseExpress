import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import Stripe from "stripe";

export const PAYMENT_AMOUNT_CENTS = 399;

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  payment: router({
    createIntent: publicProcedure
      .input(
        z.object({
          destination: z.string().trim().min(1).max(80),
          duration: z.number().int().min(1).max(14),
        }),
      )
      .mutation(async ({ input }) => {
        const secretKey = process.env.STRIPE_SECRET_KEY;
        if (!secretKey) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Stripe non è ancora configurato. Usa la modalità demo o configura le chiavi in Settings → Payment.",
          });
        }

        const stripe = new Stripe(secretKey);
        const intent = await stripe.paymentIntents.create({
          amount: PAYMENT_AMOUNT_CENTS,
          currency: "eur",
          payment_method_types: ["card"],
          description: "Valigia Perfetta & Itinerario Express",
          metadata: {
            destination: input.destination,
            duration: String(input.duration),
            product: "travel-plan-unlock",
          },
        });

        if (!intent.client_secret) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Stripe non ha restituito un client secret valido.",
          });
        }

        return { clientSecret: intent.client_secret };
      }),
  }),
});

export type AppRouter = typeof appRouter;
