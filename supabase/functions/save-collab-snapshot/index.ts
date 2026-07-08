import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type SaveSnapshotBody = {
  room_id: string;
  code_hash: string;
  expected_previous_version: number;
  encrypted_payload: string;
  payload_hash: string;
  app_version?: string;
  collab_protocol_version?: number;
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

  let body: SaveSnapshotBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (
    !body.room_id ||
    !body.code_hash ||
    !Number.isInteger(body.expected_previous_version) ||
    !body.encrypted_payload ||
    !body.payload_hash
  ) {
    return json({
      error: "room_id, code_hash, expected_previous_version, encrypted_payload and payload_hash are required",
    }, 400);
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: room, error: roomError } = await client
    .from("collab_rooms")
    .select("id, status, expires_at, latest_snapshot_version")
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

  if (room.latest_snapshot_version !== body.expected_previous_version) {
    return json({
      error: "Snapshot version conflict",
      latest_snapshot_version: room.latest_snapshot_version,
    }, 409);
  }

  const nextVersion = body.expected_previous_version + 1;
  const { error: snapshotError } = await client.from("collab_room_snapshots").insert({
    room_id: body.room_id,
    version: nextVersion,
    encrypted_payload: body.encrypted_payload,
    payload_hash: body.payload_hash,
    app_version: body.app_version ?? "unknown",
    collab_protocol_version: body.collab_protocol_version ?? 1,
  });

  if (snapshotError) {
    return json({ error: "Could not save snapshot", details: snapshotError.message }, 500);
  }

  const { error: updateError } = await client
    .from("collab_rooms")
    .update({ latest_snapshot_version: nextVersion })
    .eq("id", body.room_id)
    .eq("latest_snapshot_version", body.expected_previous_version);

  if (updateError) {
    await client
      .from("collab_room_snapshots")
      .delete()
      .eq("room_id", body.room_id)
      .eq("version", nextVersion);
    return json({ error: "Could not update room version", details: updateError.message }, 500);
  }

  return json({ version: nextVersion });
});
