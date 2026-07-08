import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type CreateRoomBody = {
  encrypted_payload: string;
  payload_hash: string;
  app_version?: string;
  collab_protocol_version?: number;
  expires_in_hours?: number;
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

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function makeCode(prefix: "ed" | "vw"): string {
  return `${prefix}_${base64Url(randomBytes(24))}`;
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64Url(new Uint8Array(digest));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Supabase service credentials are not configured" }, 500);
  }

  let body: CreateRoomBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.encrypted_payload || !body.payload_hash) {
    return json({ error: "encrypted_payload and payload_hash are required" }, 400);
  }

  const expiresInHours = Math.min(Math.max(body.expires_in_hours ?? 72, 1), 24 * 30);
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();
  const roomPublicId = base64Url(randomBytes(16));
  const editorCode = makeCode("ed");
  const viewerCode = makeCode("vw");

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: room, error: roomError } = await client
    .from("collab_rooms")
    .insert({
      room_public_id: roomPublicId,
      status: "active",
      expires_at: expiresAt,
      latest_snapshot_version: 1,
    })
    .select("id, room_public_id, expires_at, latest_snapshot_version")
    .single();

  if (roomError || !room) {
    return json({ error: "Could not create collaboration room", details: roomError?.message }, 500);
  }

  const [editorHash, viewerHash] = await Promise.all([sha256(editorCode), sha256(viewerCode)]);

  const { error: inviteError } = await client.from("collab_room_invites").insert([
    { room_id: room.id, role: "editor", code_hash: editorHash, expires_at: expiresAt },
    { room_id: room.id, role: "viewer", code_hash: viewerHash, expires_at: expiresAt },
  ]);

  if (inviteError) {
    await client.from("collab_rooms").delete().eq("id", room.id);
    return json({ error: "Could not create room invites", details: inviteError.message }, 500);
  }

  const { error: snapshotError } = await client.from("collab_room_snapshots").insert({
    room_id: room.id,
    version: 1,
    encrypted_payload: body.encrypted_payload,
    payload_hash: body.payload_hash,
    app_version: body.app_version ?? "unknown",
    collab_protocol_version: body.collab_protocol_version ?? 1,
  });

  if (snapshotError) {
    await client.from("collab_rooms").delete().eq("id", room.id);
    return json({ error: "Could not save initial snapshot", details: snapshotError.message }, 500);
  }

  return json({
    room_id: room.id,
    room_public_id: room.room_public_id,
    expires_at: room.expires_at,
    latest_snapshot_version: room.latest_snapshot_version,
    editor_code: editorCode,
    viewer_code: viewerCode,
  });
});
