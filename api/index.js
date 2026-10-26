import { expirePendingOrders } from "../server/orderLogic.js";
import { waitUntil } from "@vercel/functions";
import { app } from "../server/app.js";
import { dispatchNotifications } from "../server/notifications.js";

export function createHandler({ application = app, schedule = waitUntil, dispatch = async (options) => { await expirePendingOrders(); return dispatchNotifications(options); } } = {}) {
  return async function handler(req, res) {
    req.backgroundTasks = [];
    await new Promise((resolve) => {
      res.once("finish", resolve);
      res.once("close", resolve);
      try { application(req, res); } catch {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ message: "The API could not complete this request." }));
        } else res.end();
      }
    });
    // Retain bounded work instead of relying on a timer inside the function.
    if (req.backgroundTasks.length || (res.statusCode < 400 && !req.url.startsWith("/api/internal/notifications"))) {
      const work = Promise.allSettled(req.backgroundTasks).then(() => res.statusCode < 400 ? dispatch({ maxJobs: 2, deadline: Date.now() + 40000 }) : undefined).catch(() => console.error("Post-response tasks could not be completed."));
      schedule(work);
    }
  };
}

export default createHandler();
