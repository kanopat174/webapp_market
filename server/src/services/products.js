import { all, one } from "../db/database.js";

const RATING_JOIN = `
  LEFT JOIN (SELECT product_id, AVG(rating) AS avg_rating, COUNT(*) AS review_count FROM reviews GROUP BY product_id) r
  ON r.product_id = p.id`;

export function toProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand,
    category: row.category,
    categoryName: row.category_name,
    price: row.price,
    compareAtPrice: row.compare_at_price,
    size: row.size,
    art: { shape: row.shape, bg: row.color_bg, accent: row.color_accent },
    imageUrl: row.image_url,
    externalImageUrl: row.image_url, // the admin-entered link, kept apart from uploaded photos
    images: [],
    daysSupply: row.days_supply || null,
    tags: JSON.parse(row.tags || "[]"),
    ageMin: row.age_min,
    ageMax: row.age_max,
    gender: row.gender,
    description: row.description,
    ingredients: JSON.parse(row.ingredients || "[]"),
    usage: row.usage,
    warnings: row.warnings,
    fdaNo: row.fda_no,
    stock: row.stock,
    sold: row.sold,
    isActive: Boolean(row.is_active),
    rating: row.avg_rating ? Math.round(row.avg_rating * 10) / 10 : 0,
    reviewCount: row.review_count || 0,
  };
}

const BASE = `SELECT p.*, c.name AS category_name, r.avg_rating, r.review_count FROM products p
  JOIN categories c ON c.slug = p.category ${RATING_JOIN}`;

const SORTS = {
  popular: "p.sold DESC",
  rating: "COALESCE(r.avg_rating,0) DESC, r.review_count DESC",
  price_asc: "p.price ASC",
  price_desc: "p.price DESC",
  newest: "p.created_at DESC, p.id DESC",
};

/** Search the catalogue. Thai has no word spaces, so each whitespace-separated term is a substring match. */
export function searchProducts({ q, category, age, gender, minPrice, maxPrice, inStock, sort = "popular", page = 1, pageSize = 24, includeInactive = false }) {
  const where = [];
  const params = [];
  if (!includeInactive) where.push("p.is_active = 1");
  for (const term of (q || "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
    where.push("(lower(p.name) LIKE ? OR lower(p.brand) LIKE ? OR p.tags LIKE ? OR p.description LIKE ? OR p.ingredients LIKE ? OR c.name LIKE ?)");
    const like = `%${term.replace(/[%_]/g, "")}%`;
    params.push(like, like, like, like, like, like);
  }
  if (category) { where.push("p.category = ?"); params.push(category); }
  if (age) { where.push("? BETWEEN p.age_min AND p.age_max"); params.push(age); }
  if (gender) { where.push("(p.gender = 'all' OR p.gender = ?)"); params.push(gender); }
  if (minPrice != null) { where.push("p.price >= ?"); params.push(minPrice); }
  if (maxPrice != null) { where.push("p.price <= ?"); params.push(maxPrice); }
  if (inStock) where.push("p.stock > 0");

  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = one(`SELECT COUNT(*) AS n FROM products p JOIN categories c ON c.slug = p.category ${clause}`, ...params).n;
  const rows = all(`${BASE} ${clause} ORDER BY ${SORTS[sort] || SORTS.popular}, p.id LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  return { items: withImages(rows.map(toProduct)), total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Attach uploaded photos. The first photo becomes imageUrl (cards, cart, emails); an older single image_url still works. */
export function withImages(products) {
  const list = products.filter(Boolean);
  if (!list.length) return products;
  const rows = all(`SELECT id, product_id, url FROM product_images WHERE product_id IN (${list.map(() => "?").join(",")}) ORDER BY sort, id`, ...list.map((p) => p.id));
  for (const p of list) {
    p.images = rows.filter((r) => r.product_id === p.id).map((r) => ({ id: r.id, url: r.url }));
    if (p.images.length) p.imageUrl = p.images[0].url;
  }
  return products;
}

export const getProductBySlug = (slug) => withImages([toProduct(one(`${BASE} WHERE p.slug = ?`, slug))])[0];
export const getProductById = (id) => withImages([toProduct(one(`${BASE} WHERE p.id = ?`, id))])[0];
export const getProductsByIds = (ids) =>
  ids.length ? withImages(all(`${BASE} WHERE p.id IN (${ids.map(() => "?").join(",")})`, ...ids).map(toProduct)) : [];
export const activeProducts = () => withImages(all(`${BASE} WHERE p.is_active = 1 ORDER BY p.sold DESC`).map(toProduct));

/** Score other products by shared category, shared benefit tags and price distance. */
export function similarProducts(product, limit = 4) {
  return activeProducts()
    .filter((p) => p.id !== product.id)
    .map((p) => ({
      p,
      score: (p.category === product.category ? 3 : 0)
        + p.tags.filter((t) => product.tags.includes(t)).length * 2
        - Math.abs(p.price - product.price) / 1000
        + p.rating / 10,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}

export const listCategories = () =>
  all(`SELECT c.slug, c.name, COUNT(p.id) AS count FROM categories c
       LEFT JOIN products p ON p.category = c.slug AND p.is_active = 1 GROUP BY c.slug ORDER BY c.sort`);
