import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const PRICE_REVIEW_COOKIE = "mytcg_price_review";
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

function credentials() {
  return {
    username: process.env.PRICE_REVIEW_USERNAME || "",
    password: process.env.PRICE_REVIEW_PASSWORD || "",
    secret: process.env.PRICE_REVIEW_SESSION_SECRET || "",
  };
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function signature(username: string, expiresAt: string, secret: string) {
  return createHmac("sha256", secret).update(`${username}:${expiresAt}`).digest("base64url");
}

export function isPriceReviewConfigured() {
  const value = credentials();
  return Boolean(value.username && value.password && value.secret.length >= 32);
}

export function authenticatePriceReviewer(username: string, password: string) {
  const expected = credentials();
  return isPriceReviewConfigured() && safeEqual(username, expected.username) && safeEqual(password, expected.password);
}

export function createPriceReviewSession() {
  const { username, secret } = credentials();
  const expiresAt = String(Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS);
  return {
    value: `${expiresAt}.${signature(username, expiresAt, secret)}`,
    maxAge: SESSION_DURATION_SECONDS,
  };
}

export function isPriceReviewAuthorized(request: NextRequest) {
  if (!isPriceReviewConfigured()) return false;
  const token = request.cookies.get(PRICE_REVIEW_COOKIE)?.value;
  if (!token) return false;
  const [expiresAt, suppliedSignature] = token.split(".");
  if (!expiresAt || !suppliedSignature || Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  const { username, secret } = credentials();
  return safeEqual(suppliedSignature, signature(username, expiresAt, secret));
}
