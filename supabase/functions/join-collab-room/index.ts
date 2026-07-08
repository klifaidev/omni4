import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type InviteRole = "editor" | "viewer";

type JoinRoomBody = {
  code: string;
};

type InviteRow = {
  id: string;
  role: InviteRole;
  code_hash: string;
  expires_at: string;
  collab_rooms: {
    id: string;
    room_public_id: string;
    status: string;
    expires_at: string;
    latest_snapshot_version: number;
  } | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64Url(new Uint8Array(digest));
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  const maxLength = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;

  for (let i = 0; i < maxLength; i += 1) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }

  return diff === 0;
}

async function signToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64Url(encoder.encode(JSON.stringify(header)));
  const encodedPayload = base64Url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${encodedHeader}.${encodedPayload}`));
  return `${encodedHeader}.${encodedPayload}.${base64Url(new Uint8Array(signature))}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const tokenSecret = Deno.env.get("COLLAB_ROOM_TOKEN_SECRET") ?? serviceRoleKey;
  if (!supabaseUrl || !serviceRoleKey || !tokenSecret) {
    return json({ error: "Supabase service credentials are not configured" }, 500);
  }

  let body: JoinRoomBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const code = body.code?.trim();
  if (!code) return json({ error: "code is required" }, 400);

  const codeHash = await sha256(code);
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await client
    .from("collab_room_invites")
    .select("id, role, code_hash, expires_at, collab_rooms(id, room_public_id, status, expires_at, latest_snapshot_version)")
    .eq("code_hash", codeHash)
    .limit(1);

  if (error) return json({ error: "Could not validate invite", details: error.message }, 500);

  const invite = (data?.[0] ?? null) as InviteRow | null;
  const room = invite?.collab_rooms ?? null;
  const now = Date.now();
  const isValid =
    invite &&
    room &&
    timingSafeEqual(invite.code_hash, codeHash) &&
    invite.expires_at &&
    new Date(invite.expires_at).getTime() > now &&
    room.status === "active" &&
    new Date(room.expires_at).getTime() > now;

  if (!isValid || !invite || !room) {
    return json({ error: "Invalid or expired collaboration code" }, 401);
  }

  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + 15 * 60;
  const channel = `collab-room:${room.room_public_id}`;
  const token = await signToken(
    {
      sub: `anon:${invite.id}`,
      room_id: room.id,
      room_public_id: room.room_public_id,
      role: invite.role,
      channel,
      iat: issuedAt,
      exp: expiresAt,
    },
    tokenSecret,
  );

  return json({
    room_id: room.id,
    room_public_id: room.room_public_id,
    role: invite.role,
    realtime_channel: channel,
    token,
    token_expires_at: new Date(expiresAt * 1000).toISOString(),
    latest_snapshot_version: room.latest_snapshot_version,
  });
});
