import { test, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Category, Product } from "../db/models.js";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "catalog-route-tests-use-an-isolated-secret-with-32-characters";
const { app } = await import("../index.js");

const catalog = [
  { _id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Desk Lamp", description: "A warm reading lamp", category: "Home", categorySlug: "home", price: 20, compareAtPrice: 30, featured: true },
  { _id: "bbbbbbbbbbbbbbbbbbbbbbbb", name: "Bedside Lamp", description: "A small bedside lamp", category: "Home", categorySlug: "home", price: 10, compareAtPrice: 15, featured: true },
  { _id: "cccccccccccccccccccccccc", name: "Travel Lamp", description: "A travel light", category: "Travel", categorySlug: "travel", price: 8, compareAtPrice: 0, featured: true },
  { _id: "dddddddddddddddddddddddd", name: "Floor Lamp", description: "A tall reading lamp", category: "Home", categorySlug: "home", price: 35, compareAtPrice: 45, featured: false },
];
const collections = [{ name: "Home", slug: "home" }, { name: "Travel", slug: "travel" }];
let server;
let base;
let queryOptions;

function matches(product, filter) {
  if (filter.isPublished?.$ne === false && product.isPublished === false) return false;
  if (filter.categorySlug && product.categorySlug !== filter.categorySlug) return false;
  if (filter.featured && product.featured !== filter.featured) return false;
  if (filter.$expr && !(product.compareAtPrice > product.price)) return false;
  if (filter.$text && !`${product.name} ${product.description} ${product.category}`.toLowerCase().includes(filter.$text.$search.toLowerCase())) return false;
  return true;
}

before(async () => {
  mongoose.connection.readyState = 1;
  mock.method(Product, "find", (filter) => {
    queryOptions = { filter, sort: null, skip: 0, limit: 40 };
    return {
      sort(value) { queryOptions.sort = value; return this; },
      skip(value) { queryOptions.skip = value; return this; },
      limit(value) { queryOptions.limit = value; return this; },
      lean: async () => {
        const results = catalog.filter((product) => matches(product, filter));
        const [field, direction] = Object.entries(queryOptions.sort || { featured: -1 })[0];
        results.sort((a, b) => direction * (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0));
        return results.slice(queryOptions.skip, queryOptions.skip + queryOptions.limit);
      },
    };
  });
  mock.method(Product, "countDocuments", async (filter) => catalog.filter((product) => matches(product, filter)).length);
  mock.method(Category, "find", () => ({
    sort() { return this; },
    lean: async () => collections,
  }));
  await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  mongoose.connection.readyState = 0;
});

test("products API applies category, search, featured, sale, sort and pagination filters", async () => {
  const response = await fetch(`${base}/api/products?category=HOME&search=lamp&featured=true&sale=true&sort=price-low&page=2&limit=1`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /application\/json/);
  assert.deepEqual(body, { products: [catalog[0]], total: 2, page: 2, pages: 2 });
  assert.deepEqual(queryOptions.filter, {
    isPublished: { $ne: false },
    categorySlug: "home",
    featured: true,
    $expr: { $gt: ["$compareAtPrice", "$price"] },
    $text: { $search: "lamp" },
  });
  assert.deepEqual(queryOptions.sort, { price: 1 });
  assert.equal(queryOptions.skip, 1);
  assert.equal(queryOptions.limit, 1);
});

test("products and categories endpoints return JSON response envelopes for empty and populated results", async () => {
  const [emptyResponse, categoriesResponse] = await Promise.all([
    fetch(`${base}/api/products?category=missing`),
    fetch(`${base}/api/categories`),
  ]);
  const empty = await emptyResponse.json();
  const categoryBody = await categoriesResponse.json();

  assert.equal(emptyResponse.status, 200);
  assert.match(emptyResponse.headers.get("content-type"), /application\/json/);
  assert.deepEqual(empty, { products: [], total: 0, page: 1, pages: 0 });
  assert.equal(categoriesResponse.status, 200);
  assert.match(categoriesResponse.headers.get("content-type"), /application\/json/);
  assert.deepEqual(categoryBody, { categories: collections });
});
