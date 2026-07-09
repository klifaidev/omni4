import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type SaveCommentBody = {
  room_id: string;
  comment_id: string;
  code_hash: string;
  slide_id: string;
  block_id?: string | null;
  encrypted_payload: string;
  status?: "open" | "resolved" | "deleted";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase service credentials are not configured" }, 500);
  }

  let body: SaveCommentBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (
    !body.room_id ||
    !body.comment_id ||
    !body.code_hash ||
    !body.slide_id ||
    !body.encrypted_payload
  ) {
    return json({
      error: "room_id, comment_id, code_hash, slide_id and encrypted_payload are required",
    }, 400);
  }

  const status = body.status ?? "open";
  if (!["open", "resolved", "deleted"].includes(status)) {
    return json({ error: "Invalid comment status" }, 400);
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: room, error: roomError } = await client
    .from("collab_rooms")
    .select("id, status, expires_at")
    .eq("id", body.room_id)
    .single();

  if (roomError || !room) return json({ error: "Room not found" }, 404);
  if (room.status !== "active" || new Date(room.expires_at).getTime() <= Date.now()) {
    return json({ error: "Room expired or inactive" }, 410);
  }

  const { data: invite, error: inviteError } = await client
    .from("collab_room_invites")
    .select("role, code_hash, expires_at")
    .eq("room_id", body.room_id)
    .eq("role", "editor")
    .limit(1)
    .maybeSingle();

  const inviteValid =
    invite &&
    !inviteError &&
    timingSafeEqual(invite.code_hash, body.code_hash) &&
    new Date(invite.expires_at).getTime() > Date.now();

  if (!inviteValid) return json({ error: "Editor permission required" }, 403);

  const { data, error } = await client
    .from("collab_room_comments")
    .upsert({
      id: body.comment_id,
      room_id: body.room_id,
      slide_id: body.slide_id,
      block_id: body.block_id ?? null,
      encrypted_payload: body.encrypted_payload,
      status,
    }, { onConflict: "id" })
    .select("id, status")
    .single();

  if (error || !data) {
    return json({ error: "Could not save comment", details: error?.message }, 500);
  }

  return json(data);
});
