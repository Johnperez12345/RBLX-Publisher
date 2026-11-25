const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const INDEX_KEY = "posts/index.json";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIME_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function readPosts(bucket) {
  const object = await bucket.get(INDEX_KEY);
  if (!object) return [];
  const data = await object.json();
  return Array.isArray(data.posts) ? data.posts : [];
}

async function writePosts(bucket, posts) {
  await bucket.put(INDEX_KEY, JSON.stringify({ posts }), {
    httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" }
  });
}

function isAdmin(request, env) {
  const expected = env.POSTS_SECRET || "";
  const supplied = request.headers.get("x-post-storage-secret") || "";
  return expected.length > 0 && supplied.length === expected.length && supplied === expected;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { "allow": "GET, POST, DELETE, OPTIONS" } });
    }

    if (path === "/api/posts" && request.method === "GET") {
      try {
        const posts = await readPosts(env.POSTS_BUCKET);
        return json({ posts });
      } catch (error) {
        return json({ error: "Could not read posts." }, 500);
      }
    }

    if (path.startsWith("/media/") && request.method === "GET") {
      const filename = path.slice("/media/".length);
      if (!/^[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(filename)) {
        return new Response("Not found", { status: 404 });
      }
      const object = await env.POSTS_BUCKET.get("images/" + filename);
      if (!object) return new Response("Not found", { status: 404 });
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("cache-control", "public, max-age=31536000, immutable");
      return new Response(object.body, { headers });
    }

    if (path === "/api/posts" && request.method === "POST") {
      if (!isAdmin(request, env)) return json({ error: "Admin access required." }, 401);
      try {
        const form = await request.formData();
        const name = String(form.get("name") || "").trim().slice(0, 100);
        const robloxId = String(form.get("robloxId") || "").trim();
        const image = form.get("image");
        if (!name) return json({ error: "Enter the post name." }, 400);
        if (!/^\d{1,25}$/.test(robloxId)) return json({ error: "Enter a valid numeric Roblox ID." }, 400);
        if (!image || typeof image.stream !== "function") return json({ error: "Choose a post image." }, 400);
        if (image.size > MAX_IMAGE_BYTES) return json({ error: "Image must be 8 MB or smaller." }, 413);
        const extension = MIME_EXT[image.type];
        if (!extension) return json({ error: "Only JPG, PNG, WEBP or GIF images are allowed." }, 415);

        const postId = crypto.randomUUID();
        const filename = postId + "." + extension;
        await env.POSTS_BUCKET.put("images/" + filename, image.stream(), {
          httpMetadata: { contentType: image.type, cacheControl: "public, max-age=31536000, immutable" }
        });

        const posts = await readPosts(env.POSTS_BUCKET);
        const post = {
          id: postId,
          name,
          robloxId,
          imageUrl: url.origin + "/media/" + filename,
          createdAt: new Date().toISOString()
        };
        posts.unshift(post);
        await writePosts(env.POSTS_BUCKET, posts);
        return json({ ok: true, post }, 201);
      } catch (error) {
        return json({ error: "Could not save the post." }, 500);
      }
    }

    const deleteMatch = path.match(/^\/api\/posts\/([a-f0-9-]{36})$/);
    if (deleteMatch && request.method === "DELETE") {
      if (!isAdmin(request, env)) return json({ error: "Admin access required." }, 401);
      try {
        const postId = deleteMatch[1];
        const posts = await readPosts(env.POSTS_BUCKET);
        const post = posts.find(item => item.id === postId);
        if (!post) return json({ error: "Post not found." }, 404);
        const next = posts.filter(item => item.id !== postId);
        await writePosts(env.POSTS_BUCKET, next);
        const imageName = String(post.imageUrl || "").split("/").pop();
        if (/^[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(imageName)) {
          await env.POSTS_BUCKET.delete("images/" + imageName);
        }
        return json({ ok: true });
      } catch (error) {
        return json({ error: "Could not delete the post." }, 500);
      }
    }

    return new Response("Not found", { status: 404 });
  }
};
