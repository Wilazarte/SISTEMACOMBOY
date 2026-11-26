"use client";

export async function api<T = unknown>(url: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Error ${res.status}`);
  return json as T;
}
