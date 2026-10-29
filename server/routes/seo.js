import { Router } from "express";
import mongoose from "mongoose";
import { readFile } from "node:fs/promises";
import { Product } from "../db/models.js";
import { getStoreSettings } from "../super-admin/routes/superAdminRoutes.js";
import { requireDatabase } from "../db/connection.js";
import { httpsUrl } from "../commercePolicy.js";
export const seoRouter = Router();
export const htmlEscape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function siteUrl() {
  const value = process.env.PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (!httpsUrl(value)) throw Object.assign(new Error("Set PUBLIC_SITE_URL to the deployed HTTPS storefront origin for SEO."), { status: 503 });
  const url = new URL(value); if (/^(localhost|127\.|\[::1\])/.test(url.hostname)) throw Object.assign(new Error("PUBLIC_SITE_URL must use the deployed storefront domain."), { status: 503 }); return url.origin;
}
export function productMetadata(product, settings, origin) {
  const url = `${origin}/products/${product._id}`;
  const schema = { "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.description, image: product.image, sku: String(product._id), url, offers: { "@type": "Offer", priceCurrency: settings.currency, price: product.price, availability: `https://schema.org/${product.stock > 0 ? "InStock" : "OutOfStock"}`, url } };
  return `<title>${htmlEscape(product.name)} | ${htmlEscape(settings.siteName)}</title><meta name="description" content="${htmlEscape(product.description.slice(0, 160))}"><link rel="canonical" href="${htmlEscape(url)}"><meta property="og:type" content="product"><meta property="og:title" content="${htmlEscape(product.name)}"><meta property="og:description" content="${htmlEscape(product.description.slice(0, 200))}"><meta property="og:image" content="${htmlEscape(product.image)}"><meta property="og:url" content="${htmlEscape(url)}"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${JSON.stringify(schema).replaceAll("<", "\\u003c")}</script>`;
}
const route = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
seoRouter.get("/robots.txt", route(async (req, res) => res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /seller\nDisallow: /management\nDisallow: /super-admin\nDisallow: /my-orders\nDisallow: /checkout\nDisallow: /profile\nDisallow: /api/\nSitemap: ${siteUrl()}/sitemap.xml\n`)));
seoRouter.get("/sitemap.xml", requireDatabase, route(async (req, res) => {
  const origin = siteUrl(); const products = await Product.find({ isPublished: { $ne: false } }).select("_id updatedAt").limit(50000).lean();
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${htmlEscape(origin)}/</loc></url><url><loc>${htmlEscape(origin)}/products</loc></url>${products.map((p) => `<url><loc>${htmlEscape(origin)}/products/${p._id}</loc>${p.updatedAt ? `<lastmod>${new Date(p.updatedAt).toISOString()}</lastmod>` : ""}</url>`).join("")}</urlset>`);
}));
seoRouter.get("/products/:id", requireDatabase, route(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).type("text/plain").send("Product not found.");
  const product = await Product.findOne({ _id: req.params.id, isPublished: { $ne: false } }).lean(); if (!product) return res.status(404).type("text/plain").send("Product not found.");
  const template = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const metadata = productMetadata(product, await getStoreSettings(), siteUrl());
  const html = template.replace(/<title>[\s\S]*?<\/title>/i, "").replace(/<meta name="description"[^>]*>/i, "").replace("</head>", `${metadata}</head>`).replace('<div id="root"></div>', `<div id="root"><main><h1>${htmlEscape(product.name)}</h1><p>${htmlEscape(product.description)}</p></main></div>`);
  // The SPA entry point and external fonts need the same browser permissions as index.html.
  res.removeHeader("Content-Security-Policy"); res.type("text/html").set("Cache-Control", "no-cache").send(html);
}));
