const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Test Worker + KV connection
    if (url.pathname === "/health") {
      return Response.json({
        status: "ok",
        kvConnected: !!env.DATA_STORE,
      });
    }

    // Save a normal customer / booking submission
    if (url.pathname === "/submit" && request.method === "POST") {
      try {
        if (!env.DATA_STORE) {
          return Response.json(
            { error: "DATA_STORE KV binding is missing" },
            { status: 500 }
          );
        }

        const data = await request.json();

        // Do not accept account passwords
        // if ("password" in data) {
        //   return Response.json(
        //     { error: "Account passwords must not be submitted or stored." },
        //     { status: 400 }
        //   );
        // }

        if (!data.email) {
          return Response.json(
            { error: "Email is required" },
            { status: 400 }
          );
        }

        const entry = {
          id: crypto.randomUUID(),

          email: data.email,

          phone: data.phone || "",
          eircode: data.eircode || "",
          preferredCentres: data.preferredCentres || "",

          submittedAt: new Date().toISOString(),

          ip: request.headers.get("CF-Connecting-IP") || null,
          country: request.cf?.country || null,
        };

        const existingJson =
          (await env.DATA_STORE.get("submissions")) || "[]";

        let submissions;

        try {
          submissions = JSON.parse(existingJson);
        } catch {
          submissions = [];
        }

        submissions.unshift(entry);

        // Keep most recent 100
        submissions = submissions.slice(0, 100);

        await env.DATA_STORE.put(
          "submissions",
          JSON.stringify(submissions)
        );

        return Response.json(
          {
            success: true,
            id: entry.id,
          },
          {
            headers: corsHeaders,
          }
        );

      } catch (error) {
        return Response.json(
          {
            success: false,
            error: error.message,
          },
          {
            status: 500,
            headers: corsHeaders,
          }
        );
      }
    }

    // Simple home route
    if (url.pathname === "/") {
      return new Response(
        "BookMyTest Worker is running",
        {
          headers: {
            "Content-Type": "text/plain; charset=UTF-8",
          },
        }
      );
    }

    return new Response("Not Found", {
      status: 404,
    });
  },
};