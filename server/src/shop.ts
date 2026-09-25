import { query } from './db.js';

export interface Listing {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerPhone: string;
  sellerNationalPhone: string | null;
  sellerCountryCode: string | null;
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  location: string | null;
  mediaUrl: string | null;
  status: 'active' | 'sold' | 'archived';
  createdAt: string;
}

interface ListingRow {
  id: string;
  seller_id: string;
  seller_name: string;
  seller_phone: string;
  seller_national_phone: string | null;
  seller_country_code: string | null;
  title: string;
  description: string;
  price_cents: number;
  currency: string;
  location: string | null;
  media_url: string | null;
  status: 'active' | 'sold' | 'archived';
  created_at: Date;
}

function toListing(row: ListingRow): Listing {
  return {
    id: row.id,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    sellerPhone: row.seller_phone,
    sellerNationalPhone: row.seller_national_phone,
    sellerCountryCode: row.seller_country_code,
    title: row.title,
    description: row.description,
    priceCents: row.price_cents,
    currency: row.currency,
    location: row.location,
    mediaUrl: row.media_url,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

const LISTING_SELECT = `
  SELECT l.id,
         l.seller_id,
         u.display_name AS seller_name,
         u.phone AS seller_phone,
         u.national_phone AS seller_national_phone,
         u.country_code AS seller_country_code,
         l.title,
         l.description,
         l.price_cents,
         l.currency,
         l.location,
         l.media_url,
         l.status,
         l.created_at
  FROM shop_listings l
  JOIN users u ON u.id = l.seller_id
`;

export async function createListing(
  sellerId: string,
  input: {
    title: string;
    description: string;
    priceCents: number;
    currency: string;
    location: string | null;
    mediaUrl: string | null;
  },
): Promise<Listing> {
  const result = await query<{ id: string }>(
    `INSERT INTO shop_listings (seller_id, title, description, price_cents, currency, location, media_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      sellerId,
      input.title,
      input.description,
      input.priceCents,
      input.currency,
      input.location,
      input.mediaUrl,
    ],
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error('listing_create_failed');
  const listing = await getListing(id);
  if (!listing) throw new Error('listing_create_failed');
  return listing;
}

export async function getListing(id: string): Promise<Listing | null> {
  const result = await query<ListingRow>(`${LISTING_SELECT} WHERE l.id = $1`, [id]);
  const row = result.rows[0];
  return row ? toListing(row) : null;
}

export async function listListings(
  options: { sellerId?: string; includeArchived?: boolean; limit: number },
): Promise<Listing[]> {
  const result = await query<ListingRow>(
    `${LISTING_SELECT}
     WHERE ($1::uuid IS NULL OR l.seller_id = $1::uuid)
       AND ($2::boolean OR l.status <> 'archived')
     ORDER BY (l.status = 'active') DESC, l.created_at DESC
     LIMIT $3`,
    [options.sellerId ?? null, options.includeArchived ?? false, options.limit],
  );
  return result.rows.map(toListing);
}

export async function updateListingStatus(
  id: string,
  sellerId: string,
  status: 'active' | 'sold' | 'archived',
): Promise<Listing | null> {
  const result = await query(
    'UPDATE shop_listings SET status = $3 WHERE id = $1 AND seller_id = $2',
    [id, sellerId, status],
  );
  if ((result.rowCount ?? 0) === 0) return null;
  return getListing(id);
}

export async function deleteListing(id: string, sellerId: string): Promise<boolean> {
  const result = await query('DELETE FROM shop_listings WHERE id = $1 AND seller_id = $2', [
    id,
    sellerId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
