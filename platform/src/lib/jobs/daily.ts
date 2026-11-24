import type { Db } from "@/db/client";
import { pruneRateLimits } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";
import { autoConfirmDeliveredOrders, purgeExpiredVerificationProofs } from "@/lib/helpers/service";
import { runDailyIngestion } from "@/lib/ingestion/daily";
import {
  dispatchTelegramAlerts,
  notifyExpiredSavers,
  pruneAlertDeliveries,
  recentlyExpiredIds,
  type AlertDispatchDeps,
} from "@/lib/telegram/alerts";
import { createTelegramSender } from "@/lib/telegram/client";

export function alertDeps(db: Db): AlertDispatchDeps {
  const cfg = env();
  return {
    db,
    encryptionKey: cfg.TELEGRAM_CHATID_ENCRYPTION_KEY ?? cfg.SESSION_SECRET,
    appUrl: cfg.APP_URL,
    sender: createTelegramSender(cfg.TELEGRAM_BOT_TOKEN),
  };
}

export async function runAlerts(
  db: Db,
  options: { includeDigests: boolean; forceWeeklyDigest?: boolean },
  now: Date = new Date(),
) {
  const deps = alertDeps(db);
  const expiredNotified = await notifyExpiredSavers(deps, await recentlyExpiredIds(db, now), now);
  const alerts = await dispatchTelegramAlerts(deps, { ...options, now });
  return { ...alerts, expiredNotified };
}

/**
 * Runs every daily job. Each step is isolated so a slow source or a Telegram outage can never
 * block privacy work such as the 30-day proof purge, which runs first.
 */
export async function runDailyJobs(db: Db) {
  const failed: string[] = [];
  const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch {
      failed.push(name);
      return null;
    }
  };

  const proofsPurged = await step("purge_proofs", () => purgeExpiredVerificationProofs(db));
  const autoConfirmedOrders = await step("auto_confirm", () => autoConfirmDeliveredOrders(db));
  const summary = await step("ingestion", () => runDailyIngestion(db));
  const alerts = await step("alerts", () => runAlerts(db, { includeDigests: true }));
  await step("prune", async () => {
    await pruneRateLimits(db, 24 * 60 * 60 * 1000);
    await pruneAlertDeliveries(db);
  });

  return { ok: failed.length === 0, failed, summary, alerts, autoConfirmedOrders, proofsPurged };
}
