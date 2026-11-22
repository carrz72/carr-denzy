import "server-only";

import { cache } from "react";

/**
 * The business's Google reviews, pulled from the Google Places API (New).
 *
 * Needs two settings in Vercel and .env.local:
 *   GOOGLE_PLACES_API_KEY  an API key with "Places API (New)" enabled,
 *                          restricted to that API
 *   GOOGLE_PLACE_ID        the Place ID of the Google Business Profile
 *
 * Without them, or if Google is unreachable, this returns null and the pages
 * show a plain "read our reviews on Google" link instead — never an error.
 *
 * Google returns at most five reviews, chosen by Google. They are cached for a
 * day, which keeps the API cost to roughly one call per day per page.
 *
 * Google's terms require reviews to be shown with the author's name as given,
 * unedited, and attributed to Google. The components do both.
 */

export interface GoogleReview {
  author: string;
  authorUrl?: string;
  rating: number;
  text: string;
  when: string;
}

export interface GoogleReviewSummary {
  rating: number;
  count: number;
  mapsUrl?: string;
  reviews: GoogleReview[];
}

interface PlacesResponse {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: {
    rating?: number;
    relativePublishTimeDescription?: string;
    text?: { text?: string };
    originalText?: { text?: string };
    authorAttribution?: { displayName?: string; uri?: string };
  }[];
}

export const getGoogleReviews = cache(async (): Promise<GoogleReviewSummary | null> => {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!key || !placeId) return null;

  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en-GB`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri,reviews",
        },
        next: { revalidate: 86400 },
      },
    );

    if (!response.ok) {
      console.error("[google-reviews] request failed", response.status);
      return null;
    }

    const data = (await response.json()) as PlacesResponse;

    const reviews: GoogleReview[] = (data.reviews ?? [])
      .map((review) => ({
        author: review.authorAttribution?.displayName ?? "Google user",
        authorUrl: review.authorAttribution?.uri,
        rating: review.rating ?? 0,
        text: (review.originalText?.text ?? review.text?.text ?? "").trim(),
        when: review.relativePublishTimeDescription ?? "",
      }))
      .filter((review) => review.text.length > 0);

    return {
      rating: data.rating ?? 0,
      count: data.userRatingCount ?? 0,
      mapsUrl: data.googleMapsUri,
      reviews,
    };
  } catch (error) {
    console.error("[google-reviews] could not load", error);
    return null;
  }
});
